import { env } from 'node:process'
import { DateTime, Effect, Schema, String as Str } from 'effect'
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/http'
import { defineHandler } from 'nitro'
import { assertBodySize, getSession, updateSession } from 'nitro/h3'
import { useStorage as getStorage } from 'nitro/storage'

import {
  EmailMessage,
  EmailRequest,
  emailInboxPath,
  signInCodePath,
  statusPath,
} from '../../src/affect-dev/contracts'
import type { EmailPreview } from '../../src/affect-dev/contracts'
import { loadRuntimeEnvironment } from '../../src/runtime-env.server'
import { runBridge } from './bridge.server'
import { privateHeaders, validFetch } from './request-gate.server'

const unavailable = () => new Response(null, { status: 404, headers: privateHeaders })

const reply = (
  value:
    | { available: true }
    | { emails: EmailPreview[] }
    | { error: { message: string } | null; preview: boolean },
  status = 200,
) => Response.json(value, { status, headers: privateHeaders })

const Captured = Schema.Struct({ status: Schema.Literal('captured'), email: EmailMessage })

const previewTarget = Effect.fnUntraced(function* targetFor(req: Request) {
  if (
    env['VERCEL'] !== '1' ||
    env['VERCEL_ENV'] !== 'preview' ||
    (env['VERCEL_TARGET_ENV'] !== undefined && env['VERCEL_TARGET_ENV'] !== 'preview')
  ) {
    return null
  }

  // Nitro API requests can arrive before the first TanStack Start request.
  if (env['PREVIEW_INBOX_SECRET'] === undefined) {
    const profile = yield* Effect.promise(() =>
      getStorage('assets:affect-profile').getItem<string | Uint8Array>('.env'),
    )

    loadRuntimeEnvironment(profile)
  }

  const secret = env['PREVIEW_INBOX_SECRET']
  const origin = env['VITE_SITE_URL']
  const backend = URL.parse(env['VITE_CONVEX_SITE_URL'] ?? '')
  const url = new URL(req.url)

  if (
    secret === undefined ||
    secret.length < 32 ||
    origin !== url.origin ||
    url.protocol !== 'https:' ||
    req.headers.get('host') !== url.host ||
    !validFetch({ request: req, origin }) ||
    backend === null ||
    !/^https:\/\/[a-z0-9.-]+\.convex\.site$/u.test(backend.origin) ||
    backend.href !== `${backend.origin}/`
  ) {
    return null
  }

  return { origin, secret, url, backend }
})

export default defineHandler((event) =>
  runBridge(
    Effect.gen(function* handlePreview() {
      const { req } = event
      const target = yield* previewTarget(req)

      if (target === null) {
        return unavailable()
      }

      const { origin, secret, url, backend } = target

      if (req.method === 'GET' && url.pathname === statusPath) {
        return reply({ available: true })
      }

      const sessionConfig = {
        name: '__Host-affect-preview',
        password: `${secret}:${origin}:${backend.origin}`,
        maxAge: 300,
        sessionHeader: false as const,
        cookie: { sameSite: 'strict' as const, httpOnly: true, secure: true, path: '/' },
      }

      if (req.method === 'GET' && url.pathname === emailInboxPath) {
        const session = yield* Effect.promise(() =>
          getSession<{ email: EmailPreview }>(event, sessionConfig),
        )

        const { email } = session.data

        return reply({
          emails:
            email !== undefined && email.expiresAt > DateTime.toEpochMillis(DateTime.nowUnsafe())
              ? [email]
              : [],
        })
      }

      if (req.method !== 'POST' || url.pathname !== signInCodePath) {
        return unavailable()
      }

      if (Str.split(req.headers.get('content-type') ?? '', ';')[0] !== 'application/json') {
        return reply({ error: { message: 'Expected JSON.' }, preview: false }, 415)
      }

      yield* Effect.promise(() => assertBodySize(event, 2048))
      const body = yield* Effect.promise(() => req.json())
      const input = Schema.decodeUnknownOption(EmailRequest)(body)

      if (input._tag === 'None') {
        return reply({ error: { message: 'Enter a valid email address.' }, preview: false }, 400)
      }

      const captured = yield* HttpClientRequest.post(new URL('/affect-preview/email', backend), {
        headers: { authorization: `Bearer ${secret}` },
      }).pipe(
        HttpClientRequest.bodyJson({ email: input.value.email, origin }),
        Effect.flatMap(HttpClient.execute),
        Effect.flatMap(HttpClientResponse.filterStatusOk),
        Effect.flatMap(HttpClientResponse.schemaBodyJson(Captured)),
        Effect.timeout('20 seconds'),
        Effect.option,
      )

      if (captured._tag !== 'Some') {
        return reply({ error: { message: 'Could not send sign-in code.' }, preview: false }, 503)
      }

      const session = yield* Effect.promise(() =>
        getSession<{ email: EmailPreview }>(event, sessionConfig),
      )

      // h3 computes cookie expiry from the session's creation time.
      session.createdAt = captured.value.email.createdAt
      yield* Effect.promise(() =>
        updateSession(event, sessionConfig, {
          email: { ...captured.value.email, id: String(captured.value.email.createdAt) },
        }),
      )

      return reply({ error: null, preview: true })
    }),
  ),
)
