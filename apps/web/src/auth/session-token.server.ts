import { Effect, Schema, String } from 'effect'

const readOnlySession = '?disableCookieCache=true&disableRefresh=true'
const tokenBody = Schema.Struct({ token: Schema.String.check(Schema.isMinLength(1)) })
const unavailableMessage = 'Could not verify your session. Please try again.'

export const identityUnavailable = () => new Error(unavailableMessage)

class SessionLookupUnavailable extends Schema.TaggedError<
  SessionLookupUnavailable,
  { readonly brand: unique symbol }
>()('SessionLookupUnavailable', { message: Schema.String }) {}

const lookupUnavailable = () => SessionLookupUnavailable.make({ message: unavailableMessage })

const decodeJson = <Value, Encoded>(response: Response, schema: Schema.Codec<Value, Encoded>) =>
  Effect.tryPromise({
    try: () => response.json(),
    catch: lookupUnavailable,
  }).pipe(
    Effect.flatMap((body) => Schema.decodeUnknownEffect(schema)(body)),
    Effect.mapError(lookupUnavailable),
  )

export const readSessionToken = Effect.fn('Auth.readSessionToken')(function* readSessionToken({
  siteUrl,
  browserOrigin,
  cookie,
  signal,
  fetchEndpoint = fetch,
}: {
  siteUrl: string
  browserOrigin: string
  cookie: string | null
  signal: AbortSignal
  fetchEndpoint?: typeof fetch
}) {
  if (cookie === null || cookie === '') {
    return null
  }

  const origin = yield* Effect.try({
    try: () => new URL(browserOrigin),
    catch: lookupUnavailable,
  })

  const deadline = AbortSignal.any([signal, AbortSignal.timeout(8000)])

  const options = {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      Cookie: cookie,
      'x-better-auth-forwarded-host': origin.host,
      'x-better-auth-forwarded-proto': String.slice(0, -1)(origin.protocol),
    },
    redirect: 'error',
    signal: deadline,
  } satisfies RequestInit

  const read = (path: string) =>
    Effect.tryPromise({
      try: () => fetchEndpoint(new URL(`${path}${readOnlySession}`, siteUrl), options),
      catch: lookupUnavailable,
    })

  const token = yield* read('/api/auth/convex/token')

  if (token.ok) {
    const payload = yield* decodeJson(token, tokenBody)

    return payload.token
  }

  // Token middleware maps both lookup failure and absent session to 401.
  if (token.status === 401) {
    const session = yield* read('/api/auth/get-session')

    if (session.ok) {
      return yield* decodeJson(session, Schema.Null)
    }
  }

  return yield* lookupUnavailable()
})
