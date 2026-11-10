import { createEnv } from '@t3-oss/env-core'
import { Option, Schema, SchemaTransformation, String } from 'effect'

const trimmedUrl = Schema.String.pipe(
  Schema.decodeTo(
    Schema.String,
    SchemaTransformation.transform({
      decode: String.trim,
      encode: (value) => value,
    }),
  ),
)

const httpUrl = trimmedUrl
  .check(
    Schema.makeFilter((value) => /^https?:\/\//iu.test(value), {
      expected: 'an HTTP(S) URL with a literal scheme separator',
    }),
  )
  .pipe(
    Schema.decodeTo(
      Schema.String,
      SchemaTransformation.transform({
        decode: (value) => String.replaceAll(/[\t\n\r]/gu, '')(value),
        encode: (value) => value,
      }),
    ),
  )
  .check(
    Schema.makeFilter(
      (value) => URL.canParse(value) && /^https?:$/u.test(new URL(value).protocol),
      { expected: 'an HTTP(S) URL' },
    ),
  )

export const origin = httpUrl.check(
  Schema.makeFilter((value) => new URL(value).origin === value, {
    expected: 'an HTTP origin',
  }),
)

export const env = createEnv({
  clientPrefix: 'VITE_',
  client: {
    VITE_CONVEX_URL: Schema.toStandardSchemaV1(origin),
    VITE_CONVEX_SITE_URL: Schema.toStandardSchemaV1(origin),
    VITE_SITE_URL: Schema.toStandardSchemaV1(Schema.UndefinedOr(origin)),
  },
  runtimeEnvStrict: {
    VITE_CONVEX_URL: import.meta.env.VITE_CONVEX_URL,
    VITE_CONVEX_SITE_URL: import.meta.env.VITE_CONVEX_SITE_URL,
    VITE_SITE_URL: import.meta.env.VITE_SITE_URL,
  },
  emptyStringAsUndefined: true,
  onValidationError: () => {
    throw new Error('Invalid public Affect configuration.')
  },
})

const posthogSchema = Schema.Struct({
  host: httpUrl,
  key: Schema.Trim.check(Schema.isMinLength(1)),
})

const posthog = Schema.decodeUnknownOption(posthogSchema)({
  host: import.meta.env.VITE_POSTHOG_HOST,
  key: import.meta.env.VITE_POSTHOG_KEY,
})

export const posthogConfig = Option.getOrUndefined(posthog)
