import { Effect } from 'effect'
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/http'

import {
  Availability,
  EmailInboxSchema,
  emailInboxPath,
  SignInCodeResult,
  signInCodePath,
  statusPath,
} from './contracts'

const requestOptions = {
  cache: 'no-store',
  credentials: 'omit',
  mode: 'same-origin',
  redirect: 'error',
} satisfies RequestInit

const localUrl = (pathname: string) => new URL(pathname, window.location.origin)

export type EmailInboxResult =
  | { kind: 'available'; inbox: typeof EmailInboxSchema.Type }
  | { kind: 'unavailable' }

const readEmailInbox = Effect.fn('AffectDev.fetchEmailInbox')(function* readEmailInbox() {
  const response = yield* HttpClient.get(localUrl(emailInboxPath))

  if (response.status === 404) {
    return { kind: 'unavailable' } satisfies EmailInboxResult
  }

  const okResponse = yield* HttpClientResponse.filterStatusOk(response)
  const inbox = yield* HttpClientResponse.schemaBodyJson(EmailInboxSchema)(okResponse)

  return { kind: 'available', inbox } satisfies EmailInboxResult
}, Effect.timeout('10 seconds'))

const runDockHttp = <A, E>(
  request: Effect.Effect<A, E, HttpClient.HttpClient>,
  signal?: AbortSignal,
) => {
  if (signal?.aborted === true) {
    return Promise.reject(new Error('Development email request aborted.'))
  }

  return Effect.runPromise(
    request.pipe(
      Effect.withTracerEnabled(false),
      Effect.provideService(HttpClient.TracerPropagationEnabled, false),
      Effect.provideService(FetchHttpClient.RequestInit, requestOptions),
      Effect.provide(FetchHttpClient.layer),
    ),
    signal === undefined ? undefined : { signal },
  )
}

export const developmentEmailAvailable = (signal?: AbortSignal) => {
  if (!import.meta.env.DEV || typeof window === 'undefined') {
    return Promise.resolve(false)
  }

  const check = HttpClient.get(localUrl(statusPath)).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.flatMap(HttpClientResponse.schemaBodyJson(Availability)),
    Effect.timeout('4 seconds'),
    Effect.as(true),
  )

  return runDockHttp(check, signal).catch(() => false)
}

export const fetchEmailInbox = (signal?: AbortSignal): Promise<EmailInboxResult> =>
  runDockHttp(readEmailInbox(), signal).catch(() => {
    throw new Error('Could not load development email.')
  })

export const sendDevelopmentCode = (email: string) => {
  const send = Effect.gen(function* sendCode() {
    const request = yield* HttpClientRequest.post(localUrl(signInCodePath)).pipe(
      HttpClientRequest.bodyJson({ email }),
    )

    const response = yield* HttpClient.execute(request)
    const result = yield* HttpClientResponse.schemaBodyJson(SignInCodeResult)(response)
    const ok = response.status >= 200 && response.status < 300

    if (ok !== (result.error === null)) {
      return yield* Effect.fail('unexpected sign-in response')
    }

    return result
  }).pipe(Effect.timeout('22 seconds'))

  return runDockHttp(send).catch(() => {
    throw new Error('Could not send sign-in code.')
  })
}
