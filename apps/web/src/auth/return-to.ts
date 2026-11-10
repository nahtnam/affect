import { Cause, Effect, Schema } from 'effect'

export const DEFAULT_RETURN_TO = '/app'

const RETURN_TO_ORIGIN = 'https://return-to.invalid'
const ROOT_RELATIVE = /^\/(?!\/)/u
const UNSAFE_CHARACTERS = /[\\\p{Cc}]/u

const ReturnTo = Schema.Trim.check(
  Schema.makeFilter((value) => ROOT_RELATIVE.test(value) && !UNSAFE_CHARACTERS.test(value)),
)

export type ReturnToInput = { readonly returnTo?: unknown }

export const parseReturnTo = (input: ReturnToInput): Effect.Effect<string> =>
  Schema.decodeUnknownEffect(ReturnTo)(input.returnTo).pipe(
    Effect.flatMap((value) =>
      Effect.try({
        catch: (cause) => new Cause.UnknownError(cause),
        try: () => {
          const url = new URL(value, RETURN_TO_ORIGIN)
          const decodedPath = decodeURIComponent(url.pathname)
          const canonical = new URL(decodedPath, RETURN_TO_ORIGIN)

          return url.origin === RETURN_TO_ORIGIN &&
            ROOT_RELATIVE.test(url.pathname) &&
            canonical.origin === RETURN_TO_ORIGIN &&
            !UNSAFE_CHARACTERS.test(decodedPath) &&
            !/^\/sign-in\/*$/u.test(canonical.pathname)
            ? `${url.pathname}${url.search}${url.hash}`
            : DEFAULT_RETURN_TO
        },
      }),
    ),
    Effect.orElseSucceed(() => DEFAULT_RETURN_TO),
  )

export const safeReturnTo = (input: ReturnToInput) => Effect.runSync(parseReturnTo(input))
