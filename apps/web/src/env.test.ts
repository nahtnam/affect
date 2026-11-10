import { Record } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'

type EnvOverrides = Record<string, string | undefined>

const defaults = {
  PORTLESS_URL: undefined,
  VITE_CONVEX_SITE_URL: 'https://backend.example.test',
  VITE_CONVEX_URL: 'https://cloud.example.test',
  VITE_POSTHOG_HOST: undefined,
  VITE_POSTHOG_KEY: undefined,
  VITE_SITE_URL: 'https://app.example.test',
} satisfies EnvOverrides

const loadEnv = async (overrides: EnvOverrides = {}) => {
  vi.resetModules()
  vi.stubEnv('DEV', false)

  for (const [name, value] of Record.toEntries({ ...defaults, ...overrides })) {
    vi.stubEnv(name, value)
  }

  return await import('./env')
}

describe('T3 public environment validation with Effect schemas', () => {
  afterEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  it('accepts HTTP(S) origins and normalizes the same padded forms as before', async () => {
    const { env } = await loadEnv({
      VITE_CONVEX_URL: ' \thttps://cloud.example.test\r\n',
      VITE_SITE_URL: ' https://app.example.test ',
    })

    expect(env.VITE_CONVEX_URL).toBe('https://cloud.example.test')
    expect(env.VITE_CONVEX_SITE_URL).toBe('https://backend.example.test')
    expect(env.VITE_SITE_URL).toBe('https://app.example.test')
  })

  it('accepts an absent or blank optional site origin and absent analytics', async () => {
    const absent = await loadEnv({ VITE_SITE_URL: undefined })
    expect(absent.env.VITE_SITE_URL).toBeUndefined()
    expect(absent.posthogConfig).toBeUndefined()

    const blank = await loadEnv({ VITE_SITE_URL: '' })
    expect(blank.env.VITE_SITE_URL).toBeUndefined()
  })

  it('rejects non-origin public values through T3 with a sanitized error', async () => {
    const invalidValue = 'https://private-input.example.test/path?token=must-not-leak'
    await expect(loadEnv({ VITE_CONVEX_URL: invalidValue })).rejects.toThrow(
      'Invalid public Affect configuration.',
    )
  })

  it('keeps PostHog optional, requires a literal URL separator, and trims its key', async () => {
    const invalid = await loadEnv({
      VITE_POSTHOG_HOST: 'https:analytics.example.test',
      VITE_POSTHOG_KEY: 'project-token',
    })

    expect(invalid.posthogConfig).toBeUndefined()

    const valid = await loadEnv({
      VITE_POSTHOG_HOST: 'https://analytics.example.test/events',
      VITE_POSTHOG_KEY: '  project-token  ',
    })

    expect(valid.posthogConfig).toStrictEqual({
      host: 'https://analytics.example.test/events',
      key: 'project-token',
    })
  })

  it('rejects a tab inside the scheme through T3 while accepting a padded valid origin', async () => {
    const invalidValue = 'ht\ttps://synthetic.example.test'

    await expect(
      loadEnv({
        VITE_CONVEX_URL: invalidValue,
      }),
    ).rejects.toThrow('Invalid public Affect configuration.')

    const invalidPostHog = await loadEnv({
      VITE_POSTHOG_HOST: invalidValue,
      VITE_POSTHOG_KEY: 'project-token',
    })

    expect(invalidPostHog.posthogConfig).toBeUndefined()

    const valid = await loadEnv({
      VITE_CONVEX_URL: ' https://synthetic.example.test ',
      VITE_POSTHOG_HOST: ' https://analytics.example.test/events ',
      VITE_POSTHOG_KEY: 'project-token',
    })

    expect(valid.env.VITE_CONVEX_URL).toBe('https://synthetic.example.test')
    expect(valid.posthogConfig?.host).toBe('https://analytics.example.test/events')
  })
})

describe('auth origin selection', () => {
  afterEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  it('uses the configured site outside development even when Portless has an origin', async () => {
    const configured = await loadEnv({
      PORTLESS_URL: 'https://affect-tanstack.localhost',
      VITE_SITE_URL: ' https://app.example.test ',
    })

    const configuredAuth = await import('./auth/auth-origin.server')
    const configuredOrigin = configuredAuth.authOrigin
    expect(configuredOrigin()).toBe(configured.env.VITE_SITE_URL)
  })

  it('uses the normalized Portless origin in development', async () => {
    await loadEnv({
      PORTLESS_URL: ' \thttps://portless.example.test\n',
    })
    vi.stubEnv('DEV', true)
    const portlessAuth = await import('./auth/auth-origin.server')
    const portlessOrigin = portlessAuth.authOrigin
    expect(portlessOrigin()).toBe('https://portless.example.test')
  })

  it('rejects a nonempty invalid Portless origin instead of falling back', async () => {
    await loadEnv({
      PORTLESS_URL: 'not-an-origin',
      VITE_SITE_URL: 'https://app.example.test',
    })
    vi.stubEnv('DEV', true)
    const { authOrigin } = await import('./auth/auth-origin.server')

    expect(authOrigin).toThrow("Affect's site origin is not configured.")
  })
})
