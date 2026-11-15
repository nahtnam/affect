import { assert, describe, it } from '@effect/vitest'
import { Effect, Fiber, Schema } from 'effect'
import { HttpClient, HttpClientResponse } from 'effect/http'
import type { HttpClientRequest } from 'effect/http'
import { TestClock } from 'effect/testing'
import { afterEach, beforeEach, vi } from 'vitest'

import { appName } from '../app-config'
import { sendVerificationCode } from './email'
import type { RenderedEmail } from './email'

const deliver = (expectedFrom: string | { address: string; name: string }) => {
  const execute = vi.fn<
    (
      request: HttpClientRequest.HttpClientRequest,
    ) => Effect.Effect<HttpClientResponse.HttpClientResponse>
  >((request) =>
    Effect.gen(function* checkEmailRequest() {
      if (request.body._tag !== 'Uint8Array') {
        throw new Error('Expected JSON request body')
      }

      const payload = yield* Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(
        new TextDecoder().decode(request.body.body),
      ).pipe(Effect.orDie)

      assert.deepStrictEqual(payload, {
        from: expectedFrom,
        subject: 'Your Affect verification code',
        text: 'Your verification code is 123456. It expires in 5 minutes. If you did not request this code, you can ignore this email.',
        to: 'otp@example.com',
      })

      return HttpClientResponse.fromWeb(
        request,
        Response.json({
          result: { delivered: ['otp@example.com'], queued: [] },
          success: true,
        }),
      )
    }),
  )

  return sendVerificationCode('otp@example.com', '123456').pipe(
    Effect.provideService(HttpClient.HttpClient, HttpClient.make(execute)),
    Effect.tap(() =>
      Effect.sync(() => {
        assert.strictEqual(execute.mock.calls.length, 1)
      }),
    ),
  )
}

describe('verification email delivery', () => {
  beforeEach(() => {
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', '0123456789abcdef0123456789abcdef')
    vi.stubEnv('CLOUDFLARE_API_TOKEN', 'test-token')
    vi.stubEnv('EMAIL_FROM', 'auth@example.com')
    vi.stubEnv('EMAIL_FROM_NAME', undefined)
  })

  afterEach(() => vi.unstubAllEnvs())

  it.effect('sends the configured name as native JSON with quotes, backslashes and Unicode', () => {
    const name = 'Affect "Auth" \\ チーム'
    vi.stubEnv('EMAIL_FROM_NAME', `  ${name}  `)

    return deliver({ address: 'auth@example.com', name })
  })

  for (const [label, name] of [
    ['unset', undefined],
    ['empty', ''],
    ['spaces', '   '],
    ['NBSP', '\u00A0'],
  ] as const) {
    it.effect(`defaults sender name to the shared app name for ${label}`, () => {
      vi.stubEnv('EMAIL_FROM_NAME', name)

      return deliver({ address: 'auth@example.com', name: appName })
    })
  }

  it.effect('preserves a legacy formatted sender and its embedded name', () => {
    vi.stubEnv('EMAIL_FROM', ' Legacy Team <auth@example.com> ')
    vi.stubEnv('EMAIL_FROM_NAME', 'Override Team')

    return deliver('Legacy Team <auth@example.com>')
  })

  for (const [label, name] of [
    ['CRLF', 'Bad\r\nBcc: injected@example.com'],
    ['leading LF', '\nTeam'],
    ['trailing CR', 'Team\r'],
    ['DEL', 'Team\u007F'],
    ['Unicode line separator', 'Team\u2028'],
  ] as const) {
    it.effect(`rejects unsafe sender name ${label} without sending or capture`, () =>
      Effect.gen(function* invalidSenderTest() {
        vi.stubEnv('EMAIL_FROM_NAME', name)
        vi.stubEnv('CLOUDFLARE_API_TOKEN', undefined)
        const capture = vi.fn<(message: RenderedEmail) => void>()
        const execute = vi.fn<() => Effect.Effect<never>>(() => Effect.never)

        const error = yield* sendVerificationCode('otp@example.com', '123456', capture).pipe(
          Effect.provideService(HttpClient.HttpClient, HttpClient.make(execute)),
          Effect.flip,
        )

        assert.deepStrictEqual(
          { message: error.message, tag: error._tag },
          { message: 'Could not send sign-in code.', tag: 'EmailDeliveryError' },
        )
        assert.strictEqual(execute.mock.calls.length, 0)
        assert.strictEqual(capture.mock.calls.length, 0)
      }),
    )
  }

  it.effect('rejects an invalid name with complete provider configuration', () =>
    Effect.gen(function* invalidConfiguredSenderTest() {
      vi.stubEnv('EMAIL_FROM_NAME', 'Team\r\nBcc: injected@example.com')
      const capture = vi.fn<(message: RenderedEmail) => void>()
      const execute = vi.fn<() => Effect.Effect<never>>(() => Effect.never)

      const error = yield* sendVerificationCode('otp@example.com', '123456', capture).pipe(
        Effect.provideService(HttpClient.HttpClient, HttpClient.make(execute)),
        Effect.flip,
      )

      assert.strictEqual(error.message, 'Could not send sign-in code.')
      assert.strictEqual(execute.mock.calls.length, 0)
      assert.strictEqual(capture.mock.calls.length, 0)
    }),
  )

  it.effect('keeps development capture sender as a string when delivery config is missing', () =>
    Effect.gen(function* captureSenderTest() {
      vi.stubEnv('CLOUDFLARE_API_TOKEN', undefined)
      vi.stubEnv('EMAIL_FROM_NAME', 'Display Name')
      const capture = vi.fn<(message: RenderedEmail) => void>()
      yield* sendVerificationCode('otp@example.com', '123456', capture).pipe(
        Effect.provideService(
          HttpClient.HttpClient,
          HttpClient.make(() => Effect.never),
        ),
      )
      assert.strictEqual(capture.mock.calls.length, 1)
      assert.strictEqual(capture.mock.calls[0]?.[0].from, 'auth@example.com')
    }),
  )

  it.effect('times out delivery and returns a sanitized error', () =>
    Effect.gen(function* emailTimeoutTest() {
      const client = HttpClient.make(() => Effect.never)

      const fiber = yield* Effect.forkChild(
        sendVerificationCode('otp@example.com', '123456').pipe(
          Effect.flip,
          Effect.provideService(HttpClient.HttpClient, client),
        ),
      )

      yield* TestClock.adjust('14 seconds')
      assert.isUndefined(fiber.pollUnsafe())

      yield* TestClock.adjust('1 second')
      const error = yield* Fiber.join(fiber)

      assert.deepStrictEqual(
        { message: error.message, tag: error._tag },
        { message: 'Could not send sign-in code.', tag: 'EmailDeliveryError' },
      )
    }),
  )
})
