import { convexTest } from 'convex-test'
import { Effect, Record } from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import schema from './schema'

describe('Better Auth configuration boundaries', () => {
  beforeEach(() => {
    vi.resetModules()

    for (const [name, value] of Record.toEntries({
      BETTER_AUTH_SECRET: undefined,
      SITE_URL: undefined,
      TRUSTED_ORIGINS: undefined,
    })) {
      vi.stubEnv(name, value)
    }
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('loads the component adapter and schema entry without app runtime settings', async () => {
    const adapter = await import('./betterAuth/adapter')
    const { auth } = await import('./betterAuth/auth')

    expect(adapter.create.isMutation).toBeTruthy()
    expect(adapter.findOne.isQuery).toBeTruthy()
    expect(auth.options).not.toHaveProperty('secret')
  })

  it('still validates required settings when runtime auth is created', async () => {
    const { createAuth } = await import('./auth')
    const t = convexTest(schema, import.meta.glob('./_generated/*.js'))

    await expect(
      t.run((ctx) => Effect.runPromise(Effect.sync(() => createAuth(ctx)))),
    ).rejects.toMatchObject({
      _tag: 'ConfigError',
    })
  })
})
