import { Effect, Result, Schema, String } from 'effect'
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/http'

import { env as deployment } from './_generated/server'
import { emailEnvironment, emailPreviewSender, emailSenderName } from './env'

class EmailDeliveryError extends Schema.TaggedError<
  EmailDeliveryError,
  { readonly brand: unique symbol }
>()('EmailDeliveryError', { message: Schema.String }) {}

const emailResponse = Schema.Struct({
  result: Schema.Struct({
    delivered: Schema.Array(Schema.String),
    queued: Schema.Array(Schema.String),
  }),
  success: Schema.Literal(true),
})

export const verificationCodeLifetimeSeconds = 300

export type RenderedEmail = {
  from?: string
  subject: string
  text: string
  to: string
}

const renderVerificationEmail = (to: string, otp: string, from?: string): RenderedEmail => {
  const message = {
    subject: 'Your Affect verification code',
    text: `Your verification code is ${otp}. It expires in 5 minutes. If you did not request this code, you can ignore this email.`,
    to,
  }

  return from === undefined ? message : { ...message, from }
}

export const sendVerificationCode = Effect.fn('sendVerificationCode')(
  function* sendVerificationCodeProgram(
    email: string,
    otp: string,
    capture?: (message: RenderedEmail) => void,
  ) {
    if (deployment.PREVIEW_INBOX_SECRET !== undefined && deployment.PREVIEW_INBOX_SECRET !== '') {
      if (capture === undefined) {
        return yield* EmailDeliveryError.make({ message: 'Use the preview inbox.' })
      }

      return yield* Effect.sync(() => {
        capture(renderVerificationEmail(email, otp))
      })
    }

    const previewSender = yield* emailPreviewSender

    // Preserve legacy formatted senders without parsing or replacing their embedded name.
    const legacySender =
      String.includes('<')(previewSender ?? '') && String.includes('>')(previewSender ?? '')

    const senderName = legacySender ? undefined : yield* emailSenderName
    const settings = yield* Effect.result(emailEnvironment)

    if (Result.isFailure(settings)) {
      if (capture === undefined) {
        return yield* Effect.fail(settings.failure)
      }

      return yield* Effect.sync(() => {
        capture(renderVerificationEmail(email, otp, previewSender))
      })
    }

    const env = settings.success
    const httpClient = yield* HttpClient.HttpClient
    const client = HttpClient.filterStatusOk(httpClient)

    const request = yield* HttpClientRequest.post(
      `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/email/sending/send`,
    ).pipe(
      HttpClientRequest.bearerToken(env.CLOUDFLARE_API_TOKEN),
      HttpClientRequest.bodyJson({
        ...renderVerificationEmail(email, otp),
        from: legacySender ? env.EMAIL_FROM : { address: env.EMAIL_FROM, name: senderName },
      }),
    )

    return yield* client
      .execute(request)
      .pipe(
        Effect.flatMap(
          HttpClientResponse.schemaBodyJson(
            emailResponse.check(
              Schema.makeFilter(
                ({ result }) => result.delivered.includes(email) || result.queued.includes(email),
              ),
            ),
          ),
        ),
        Effect.asVoid,
      )
  },
  Effect.timeout('15 seconds'),
  Effect.tapError((failure) =>
    Effect.logError('Email delivery failed', {
      errorTag: failure._tag,
      httpStatus: failure._tag === 'HttpClientError' ? (failure.response?.status ?? null) : null,
    }),
  ),
  Effect.mapError(() => EmailDeliveryError.make({ message: 'Could not send sign-in code.' })),
)
