import { v } from 'convex/values'
import { DateTime, Effect, Option, Schema } from 'effect'
import { some } from 'effect/Array'
import { FetchHttpClient } from 'effect/http'

import type { ActionCtx } from './_generated/server'
import { internalAction } from './_generated/server'
import { createAuthWithOtpDelivery } from './auth'
import type { RenderedEmail } from './email'
import { sendVerificationCode, verificationCodeLifetimeSeconds } from './email'
import { authEnvironment, matchesEmailDeployment } from './env'
import { isLocalDevelopmentOrigin } from './lib/localDevelopment'
import { TracingLive } from './tracing'

type SendArgs = { cloudUrl: string; email: string; origin: string }

type Capture = {
  message?: RenderedEmail & { code: string }
}

const sendCode = Effect.fn('AffectDev.sendSignInCode')(
  function* sendSignInCode(ctx: ActionCtx, { cloudUrl, email, origin }: SendArgs) {
    const settings = yield* authEnvironment
    const matches = yield* matchesEmailDeployment(cloudUrl)

    const requestOrigin = Schema.decodeOption(Schema.URLFromString)(origin)

    if (
      !matches ||
      !isLocalDevelopmentOrigin(settings.SITE_URL) ||
      Option.isNone(requestOrigin) ||
      !isLocalDevelopmentOrigin(requestOrigin.value) ||
      origin !== requestOrigin.value.origin ||
      (origin !== settings.SITE_URL.origin &&
        !some(settings.TRUSTED_ORIGINS, (allowed) => allowed.origin === origin))
    ) {
      return { status: 'unavailable' as const }
    }

    const createdAt = DateTime.toEpochMillis(DateTime.nowUnsafe())
    const captured: Capture = {}
    let delivered = false

    const context = yield* Effect.context()
    const run = Effect.runPromiseWith(context)

    const auth = createAuthWithOtpDelivery({
      ctx,
      delivery: ({ email: to, otp, type }) =>
        type === 'sign-in'
          ? run(
              sendVerificationCode(to, otp, (message) => {
                captured.message = { ...message, code: otp }
              }).pipe(
                Effect.tap(() =>
                  Effect.sync(() => {
                    delivered = true
                  }),
                ),
                Effect.provide([FetchHttpClient.layer, TracingLive]),
              ),
            )
          : Promise.reject(new Error('Only sign-in codes can be previewed.')),
    })

    const body = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({
      email,
      type: 'sign-in',
    })

    const response = yield* Effect.tryPromise({
      catch: () => 'handlerFailure' as const,
      try: () =>
        auth.handler(
          new Request(new URL('/api/auth/email-otp/send-verification-otp', origin), {
            body,
            headers: { 'Content-Type': 'application/json', Origin: origin },
            method: 'POST',
          }),
        ),
    })

    if (response.status === 429) {
      return { status: 'rateLimited' as const }
    }

    if (response.status === 400) {
      return { status: 'invalid' as const }
    }

    if (!response.ok || !delivered) {
      return { status: 'failed' as const }
    }

    if (captured.message === undefined) {
      return { status: 'sent' as const }
    }

    return {
      email: {
        ...captured.message,
        createdAt,
        expiresAt: createdAt + verificationCodeLifetimeSeconds * 1000,
      },
      status: 'captured' as const,
    }
  },
  Effect.orElseSucceed(() => ({ status: 'failed' as const })),
)

export const send = internalAction({
  args: { cloudUrl: v.string(), email: v.string(), origin: v.string() },
  handler: (ctx, args) => Effect.runPromise(sendCode(ctx, args)),
  returns: v.union(
    v.object({ status: v.literal('unavailable') }),
    v.object({ status: v.literal('rateLimited') }),
    v.object({ status: v.literal('invalid') }),
    v.object({ status: v.literal('failed') }),
    v.object({ status: v.literal('sent') }),
    v.object({
      email: v.object({
        code: v.string(),
        createdAt: v.number(),
        expiresAt: v.number(),
        from: v.optional(v.string()),
        html: v.optional(v.string()),
        subject: v.string(),
        text: v.string(),
        to: v.string(),
      }),
      status: v.literal('captured'),
    }),
  ),
})
