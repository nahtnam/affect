import { assert, describe, it } from '@effect/vitest'
import { Effect, Fiber } from 'effect'
import { HttpClient } from 'effect/http'
import { TestClock } from 'effect/testing'
import { afterEach, beforeEach, vi } from 'vitest'

import { sendVerificationCode } from './email'

describe('verification email delivery', () => {
  beforeEach(() => {
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', '0123456789abcdef0123456789abcdef')
    vi.stubEnv('CLOUDFLARE_API_TOKEN', 'test-token')
    vi.stubEnv('EMAIL_FROM', 'auth@example.com')
  })

  afterEach(() => vi.unstubAllEnvs())

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
