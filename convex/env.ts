import { Config, ConfigProvider, Effect, Schema, String } from 'effect'

import { env } from './_generated/server'

const provider = Effect.sync(() =>
  ConfigProvider.fromEnvRecord({
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
    CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN,
    EMAIL_FROM: env.EMAIL_FROM,
    POSTHOG_HOST: env.POSTHOG_HOST,
    POSTHOG_PROJECT_TOKEN: env.POSTHOG_PROJECT_TOKEN,
    SITE_URL: env.SITE_URL,
    TRUSTED_ORIGINS: env.TRUSTED_ORIGINS,
  }),
)

const HttpUrl = Schema.URLFromString.check(
  Schema.makeFilter(
    (url) =>
      ['http:', 'https:'].includes(url.protocol) && url.username === '' && url.password === '',
    { expected: 'an HTTP(S) URL without credentials' },
  ),
)

const Origin = HttpUrl.check(
  Schema.makeFilter((url) => url.pathname === '/' && url.search === '' && url.hash === '', {
    expected: 'an origin without a path, query, or fragment',
  }),
)

const authConfig = Config.all({
  BETTER_AUTH_SECRET: Config.schema(
    Schema.Redacted(Schema.Trimmed.check(Schema.isMinLength(32))),
    'BETTER_AUTH_SECRET',
  ),
  SITE_URL: Config.schema(Origin, 'SITE_URL'),
  TRUSTED_ORIGINS: Config.Array(Origin, 'TRUSTED_ORIGINS'),
})

export const authEnvironment = provider.pipe(Effect.flatMap((current) => authConfig.parse(current)))

const emailConfig = Config.schema(
  Schema.Struct({
    CLOUDFLARE_ACCOUNT_ID: Schema.Trim.check(Schema.isMinLength(1)),
    CLOUDFLARE_API_TOKEN: Schema.Redacted(Schema.Trim.check(Schema.isMinLength(1))),
    EMAIL_FROM: Schema.Trim.check(Schema.isMinLength(1)),
  }),
)

export const matchesEmailDeployment = (cloudUrl: string) =>
  Effect.sync(() => env.CONVEX_CLOUD_URL === cloudUrl)

export const emailPreviewSender = Effect.sync(() => {
  const sender = String.trim(env.EMAIL_FROM ?? '')

  return sender === '' ? undefined : sender
})

export const emailEnvironment = provider.pipe(
  Effect.flatMap((current) => emailConfig.parse(current)),
)

const tracingConfig = Config.schema(
  Schema.Struct({
    POSTHOG_HOST: HttpUrl,
    POSTHOG_PROJECT_TOKEN: Schema.Redacted(Schema.Trim.check(Schema.isMinLength(1))),
  }),
)

export const tracingEnvironment = provider.pipe(
  Effect.flatMap((current) => tracingConfig.parse(current)),
  Effect.option,
)
