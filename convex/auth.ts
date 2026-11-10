import { createClient } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import { requireRunMutationCtx } from '@convex-dev/better-auth/utils'
import type { GenericCtx } from '@convex-dev/better-auth/utils'
import { MINUTE, RateLimiter } from '@convex-dev/rate-limiter'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { betterAuth } from 'better-auth/minimal'
import type { BetterAuthOptions } from 'better-auth/minimal'
import { admin } from 'better-auth/plugins/admin'
import { emailOTP } from 'better-auth/plugins/email-otp'
import type { EmailOTPOptions } from 'better-auth/plugins/email-otp'
import { ConvexError, v } from 'convex/values'
import { Cause, Effect, Redacted, String } from 'effect'
import { contains, findFirst, map } from 'effect/Array'
import { FetchHttpClient } from 'effect/http'
import { match } from 'effect/Option'

import { components } from './_generated/api'
import type { DataModel } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'
import { query } from './_generated/server'
import authConfig from './auth.config'
import authSchema from './betterAuth/schema'
import { sendVerificationCode, verificationCodeLifetimeSeconds } from './email'
import { authEnvironment } from './env'
import { TracingLive } from './tracing'

export const authComponent = createClient<DataModel, typeof authSchema>(components.betterAuth, {
  local: { schema: authSchema },
})

type OtpDelivery = EmailOTPOptions['sendVerificationOTP']

const deliverOtp: OtpDelivery = ({ email, otp }) =>
  Effect.runPromise(
    sendVerificationCode(email, otp).pipe(Effect.provide([FetchHttpClient.layer, TracingLive])),
  )

const createOtpPlugin = (sendVerificationOTP: OtpDelivery) =>
  emailOTP({
    expiresIn: verificationCodeLifetimeSeconds,
    sendVerificationOTP,
    storeOTP: 'hashed',
  })

const emailOTPPlugin = createOtpPlugin(deliverOtp)

const otpRateLimiter = new RateLimiter(components.rateLimiter, {
  otpSend: { kind: 'fixed window', period: MINUTE, rate: 3 },
})

const otpRecipientEndpoints = [
  emailOTPPlugin.endpoints.sendVerificationOTP,
  emailOTPPlugin.endpoints.requestPasswordResetEmailOTP,
  emailOTPPlugin.endpoints.forgetPasswordEmailOTP,
]

const enforceOtpRecipientLimit = Effect.fn('Auth.enforceOtpRecipientLimit')(
  (ctx: GenericCtx<DataModel>, email: string) =>
    Effect.tryPromise({
      catch: (error) => new Cause.UnknownError(error),
      try: () =>
        otpRateLimiter.limit(requireRunMutationCtx(ctx), 'otpSend', {
          key: email,
        }),
    }).pipe(
      Effect.flatMap((status) =>
        status.ok
          ? Effect.undefined
          : Effect.fail(
              new APIError(
                'TOO_MANY_REQUESTS',
                { message: 'Too many requests. Please try again later.' },
                {
                  'Retry-After': globalThis.String(Math.ceil(status.retryAfter / 1000)),
                },
              ),
            ),
      ),
    ),
)

const authOptions = (ctx: GenericCtx<DataModel>, otpPlugin: typeof emailOTPPlugin) =>
  ({
    appName: 'Affect',
    database: authComponent.adapter(ctx),
    hooks: {
      before: createAuthMiddleware((hookContext) =>
        match(
          findFirst(otpRecipientEndpoints, (candidate) => candidate.path === hookContext.path),
          {
            onNone: () => Promise.resolve(),
            onSome: (endpoint) => {
              const parsed = endpoint.options.body.safeParse(hookContext.body)

              return parsed.success
                ? Effect.runPromise(
                    enforceOtpRecipientLimit(ctx, String.toLowerCase(parsed.data.email)),
                  )
                : Promise.resolve()
            },
          },
        ),
      ),
    },
    plugins: [admin(), otpPlugin, convex({ authConfig })],
    // The native IP limiter stays disabled because forwarded headers are untrusted;
    // recipient limits above own OTP sends instead.
    rateLimit: { enabled: false },
  }) satisfies BetterAuthOptions

export const createAuthOptions = (ctx: GenericCtx<DataModel>) => authOptions(ctx, emailOTPPlugin)

const createAuthInstance = (ctx: GenericCtx<DataModel>, otpPlugin: typeof emailOTPPlugin) => {
  const env = Effect.runSync(authEnvironment)

  return betterAuth({
    ...authOptions(ctx, otpPlugin),
    baseURL: env.SITE_URL.href,
    secret: Redacted.value(env.BETTER_AUTH_SECRET),
    trustedOrigins: map(env.TRUSTED_ORIGINS, (origin) => origin.origin),
  })
}

export const createAuth = (ctx: GenericCtx<DataModel>) => createAuthInstance(ctx, emailOTPPlugin)

export const createAuthWithOtpDelivery = ({
  ctx,
  delivery,
}: {
  ctx: GenericCtx<DataModel>
  delivery: OtpDelivery
}) => createAuthInstance(ctx, createOtpPlugin(delivery))

const isPlatformAdmin = (role: string | null | undefined) =>
  contains(String.split(role ?? '', ','), 'admin')

export const requirePlatformAdmin = Effect.fnUntraced(function* requirePlatformAdminProgram(
  ctx: GenericCtx<DataModel>,
) {
  const user = yield* Effect.tryPromise({
    catch: (error) => (error instanceof ConvexError ? error : new Cause.UnknownError(error)),
    try: () => authComponent.getAuthUser(ctx),
  })

  if (!isPlatformAdmin(user.role)) {
    return yield* Effect.fail(new ConvexError('Platform admin access required.'))
  }

  return user
})

export const currentUser = query({
  args: {},
  handler: Effect.fnUntraced(
    function* currentUser(ctx: QueryCtx) {
      const user = yield* Effect.tryPromise({
        catch: (error) => new Cause.UnknownError(error),
        try: () => authComponent.safeGetAuthUser(ctx),
      })

      return user !== undefined && user !== null
        ? {
            email: user.email,
            id: user._id,
            isAdmin: isPlatformAdmin(user.role),
          }
        : null
    },
    (program) => Effect.runPromise(program),
  ),
  returns: v.union(v.null(), v.object({ email: v.string(), id: v.string(), isAdmin: v.boolean() })),
})
