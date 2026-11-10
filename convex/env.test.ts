import { assert, describe, it } from '@effect/vitest'
import { Effect, String as EffectString } from 'effect'
import { afterEach, beforeEach, vi } from 'vitest'

import { authEnvironment } from './env'

const authValues = {
  BETTER_AUTH_SECRET: EffectString.repeat(32)('a'),
  SITE_URL: 'https://app.example.com',
  TRUSTED_ORIGINS: 'https://app.example.com, https://admin.example.com',
}

describe('environment configuration', () => {
  beforeEach(() => {
    vi.stubEnv('BETTER_AUTH_SECRET', authValues.BETTER_AUTH_SECRET)
    vi.stubEnv('SITE_URL', authValues.SITE_URL)
    vi.stubEnv('TRUSTED_ORIGINS', authValues.TRUSTED_ORIGINS)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it.effect('does not render an invalid auth secret', () =>
    Effect.gen(function* invalidAuthSecret() {
      const secret = 'synthetic-private-secret'
      vi.stubEnv('BETTER_AUTH_SECRET', secret)
      const error = yield* Effect.flip(authEnvironment)
      const rendered = String(error)

      assert.strictEqual(error._tag, 'ConfigError')
      assert.isFalse(EffectString.includes(secret)(rendered))
    }),
  )

  it('reads the get-only environment proxy lazily', async () => {
    const values = new Map<PropertyKey, string | undefined>([
      ['BETTER_AUTH_SECRET', authValues.BETTER_AUTH_SECRET],
      ['SITE_URL', authValues.SITE_URL],
      ['TRUSTED_ORIGINS', authValues.TRUSTED_ORIGINS],
    ])

    const proxy = new Proxy({}, { get: (_target, property) => values.get(property) })

    assert.deepStrictEqual(Reflect.ownKeys(proxy), [])
    assert.isFalse(Reflect.has(proxy, 'SITE_URL'))

    vi.resetModules()

    vi.stubGlobal('process', { env: proxy })
    const { authEnvironment: proxiedAuthEnvironment } = await import('./env')

    const settings = await Effect.runPromise(proxiedAuthEnvironment)
    assert.strictEqual(settings.SITE_URL.href, 'https://app.example.com/')

    values.set('SITE_URL', 'https://changed.example.com')
    const changed = await Effect.runPromise(proxiedAuthEnvironment)
    assert.strictEqual(changed.SITE_URL.href, 'https://changed.example.com/')
  })
})
