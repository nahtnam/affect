import { Array, Clock, Effect, Schema, String as EffectString } from 'effect'
import { H3 } from 'nitro/h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { addEmailPreview, readEmailInbox } from '../../server/affect-dev/inbox.server'
import emails from '../../server/api/affect-dev/emails.get.dev'
import send from '../../server/api/affect-dev/sign-in-code.post.dev'
import status from '../../server/api/affect-dev/status.get.dev'
import { emailInboxPath, signInCodePath, statusPath } from './contracts'

const origin = 'https://affect.localhost'
const cloud = 'https://synthetic-dev.convex.cloud'
const key = 'dev:synthetic-dev|synthetic-key'
const now = 1_800_000_000_000
const ttl = 300_000
const jsonSchema = Schema.fromJsonString(Schema.Unknown)
const json = Schema.encodeSync(jsonSchema)
const readJson = (response: Response) => response.text().then(Schema.decodeSync(jsonSchema))
const address = 'person@example.test'

const message = {
  code: '123456',
  createdAt: now,
  expiresAt: now + ttl,
  from: 'affect@example.test',
  html: '<p>Synthetic preview</p>',
  subject: 'Sign-in code',
  text: 'Your code is 123456',
  to: address,
}

const app = new H3().get(statusPath, status).get(emailInboxPath, emails).post(signInCodePath, send)

const metadata = { deploymentType: 'dev', kind: 'cloud' }
const upstream = vi.fn<typeof fetch>()

const local = (path: string, init?: RequestInit) => {
  const headers = new Headers({
    host: 'affect.localhost',
    'x-forwarded-for': '127.0.0.1',
    'x-forwarded-host': 'affect.localhost',
    'x-forwarded-port': '443',
    'x-forwarded-proto': 'https',
  })

  for (const [name, value] of new Headers(init?.headers)) {
    headers.set(name, value)
  }

  return Promise.resolve(app.fetch(new Request(origin + path, { ...init, headers })))
}

const post = (init?: RequestInit) => {
  const headers = new Headers({ 'Content-Type': 'application/json', Origin: origin })

  for (const [name, value] of new Headers(init?.headers)) {
    headers.set(name, value)
  }

  return local(signInCodePath, {
    body: json({ email: address }),
    method: 'POST',
    ...init,
    headers,
  })
}

describe('Affect Dev Email', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('VERCEL_ENV', undefined)
    vi.stubEnv('PORTLESS_LAN', undefined)
    vi.stubEnv('PORTLESS_TAILSCALE_URL', undefined)
    vi.stubEnv('PORTLESS_NGROK_URL', undefined)
    vi.stubEnv('PORTLESS_URL', origin)
    vi.stubEnv('CONVEX_DEPLOY_KEY', key)
    vi.stubEnv('VITE_CONVEX_URL', cloud)
    vi.stubEnv('VITE_CONVEX_SITE_URL', 'https://synthetic-dev.convex.site')
    vi.stubGlobal('fetch', upstream)
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })

  afterEach(() => {
    globalThis.affectDevEmailInbox?.expiry?.cancel()
    globalThis.affectDevEmailInbox = undefined
    upstream.mockReset()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  describe('local request gate', () => {
    it.each([
      ['NODE_ENV', 'production'],
      ['VERCEL_ENV', 'preview'],
      ['PORTLESS_LAN', 'true'],
      ['PORTLESS_LAN', '1'],
      ['PORTLESS_TAILSCALE_URL', 'https://shared.example.test'],
      ['PORTLESS_NGROK_URL', 'https://shared.example.test'],
      ['PORTLESS_URL', 'https://affect.localhost/path'],
      ['CONVEX_DEPLOY_KEY', 'prod:synthetic-dev|synthetic-key'],
      ['CONVEX_DEPLOY_KEY', 'dev:other|synthetic-key'],
      ['VITE_CONVEX_URL', 'https://synthetic-dev.convex.cloud.example.test'],
      ['VITE_CONVEX_SITE_URL', 'https://other.convex.site'],
    ])('denies an unsupported %s before fetching or reading previews', (name, value) =>
      Effect.runPromise(
        Effect.gen(function* denyRuntime() {
          vi.stubEnv(name, value)
          expect(addEmailPreview(message)).toBeTruthy()

          const responses = yield* Effect.promise(() =>
            Promise.all([local(statusPath), local(emailInboxPath), post()]),
          )

          const bodies = yield* Effect.promise(() =>
            Promise.all(Array.map((response: Response) => response.text())(responses)),
          )

          expect(Array.map((response: Response) => response.status)(responses)).toStrictEqual([
            404, 404, 404,
          ])
          expect(Array.join('')(bodies)).not.toContain(message.code)

          expect(upstream).not.toHaveBeenCalled()
        }),
      ),
    )

    it.each([
      ['host', 'sibling.localhost'],
      ['origin', 'https://sibling.localhost'],
      ['sec-fetch-site', 'same-site'],
      ['sec-fetch-mode', 'navigate'],
      ['x-forwarded-for', '203.0.113.25'],
      ['x-forwarded-for', '127.0.0.1, 127.0.0.1'],
      ['x-forwarded-host', 'public.example.test'],
      ['x-forwarded-proto', 'http'],
      ['x-forwarded-port', '3000'],
      ['forwarded', 'for=127.0.0.1'],
    ])('denies contradictory or public %s on all routes', (name, value) =>
      Effect.runPromise(
        Effect.gen(function* denyHeaders() {
          const headers = { [name]: value }

          for (const response of yield* Effect.promise(() =>
            Promise.all([
              local(statusPath, { headers }),
              local(emailInboxPath, { headers }),
              post({ headers }),
            ]),
          )) {
            expect(response.status).toBe(404)
            expect(response.headers.get('cache-control')).toBe('private, no-store')
            expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin')
          }

          expect(upstream).not.toHaveBeenCalled()
        }),
      ),
    )

    it('requires the exact POST Origin and GET method', () =>
      Effect.runPromise(
        Effect.gen(function* requireMethodAndOrigin() {
          const [noOrigin, head] = yield* Effect.promise(() =>
            Promise.all([
              local(signInCodePath, { method: 'POST' }),
              local(emailInboxPath, { method: 'HEAD' }),
            ]),
          )

          expect([noOrigin.status, head.status]).toStrictEqual([404, 404])
          expect(upstream).not.toHaveBeenCalled()
        }),
      ))

    it('supports a separately configured direct loopback authority without proxy headers', () =>
      Effect.runPromise(
        Effect.gen(function* directLoopback() {
          vi.stubEnv('PORTLESS_URL', undefined)
          vi.stubEnv('VITE_SITE_URL', 'http://127.0.0.1:3000')

          const response = yield* Effect.promise(() =>
            Promise.resolve(
              app.fetch(
                new Request(`http://127.0.0.1:3000${emailInboxPath}`, {
                  headers: { host: '127.0.0.1:3000' },
                }),
              ),
            ),
          )

          expect(response.status).toBe(200)
          const body = yield* Effect.promise(() => readJson(response))
          expect(body).toStrictEqual({ emails: [] })
        }),
      ))
  })

  describe('fixed development action', () => {
    it.each([
      { deploymentType: 'prod', kind: 'cloud' },
      { deploymentType: 'preview', kind: 'cloud' },
      { deploymentType: 'dev', kind: 'local' },
      { deploymentType: 'dev' },
    ])('requires authoritative cloud development metadata for status and send', (info) =>
      Effect.runPromise(
        Effect.gen(function* requireDevelopmentMetadata() {
          upstream
            .mockResolvedValueOnce(Response.json(info))
            .mockResolvedValueOnce(Response.json(info))
          const availability = yield* Effect.promise(() => local(statusPath))
          const sendResult = yield* Effect.promise(() => post())

          expect([availability.status, sendResult.status]).toStrictEqual([404, 503])
          expect(
            Array.map(([url]: Parameters<typeof fetch>) => (url instanceof URL ? url.href : url))(
              upstream.mock.calls,
            ),
          ).toStrictEqual([`${cloud}/api/v1/deployment_info`, `${cloud}/api/v1/deployment_info`])
          expect(readEmailInbox()).toStrictEqual([])
        }),
      ),
    )

    it('checks availability without reading or creating an inbox', () =>
      Effect.runPromise(
        Effect.gen(function* checkAvailability() {
          upstream.mockResolvedValueOnce(Response.json(metadata))

          const response = yield* Effect.promise(() =>
            local(statusPath, { headers: { 'sec-fetch-site': 'same-origin' } }),
          )

          const body = yield* Effect.promise(() => readJson(response))
          expect(body).toStrictEqual({ available: true })
          expect(globalThis.affectDevEmailInbox).toBeUndefined()
        }),
      ))

    it('limits JSON before any privileged call, including an unlabelled chunked body', () =>
      Effect.runPromise(
        Effect.gen(function* limitBody() {
          const stream = new ReadableStream({
            start(controller) {
              const chunk = new Uint8Array(1100)
              controller.enqueue(chunk)
              controller.enqueue(chunk)
              controller.close()
            },
          })

          const large = yield* Effect.promise(() =>
            post({
              body: json({ email: address, padding: EffectString.repeat(3000)('x') }),
            }),
          )

          const streamingRequest: RequestInit & { duplex: 'half' } = {
            body: stream,
            duplex: 'half',
          }

          const chunked = yield* Effect.promise(() => post(streamingRequest))

          const invalidType = yield* Effect.promise(() =>
            post({ headers: { 'Content-Type': 'text/plain' } }),
          )

          expect([large.status, chunked.status, invalidType.status]).toStrictEqual([400, 400, 415])
          expect(upstream).not.toHaveBeenCalled()
        }),
      ))

    it('uses only fixed requests and acknowledges a capture only after insertion', () =>
      Effect.runPromise(
        Effect.gen(function* capture() {
          upstream
            .mockResolvedValueOnce(Response.json(metadata))
            .mockResolvedValueOnce(
              Response.json({ status: 'success', value: { email: message, status: 'captured' } }),
            )

          const response = yield* Effect.promise(() =>
            post({
              body: json({
                email: address,
                cloudUrl: 'https://evil.example.test',
                path: 'evil',
              }),
              headers: { cookie: 'ignored=1', traceparent: 'ignored' },
            }),
          )

          expect(response.status).toBe(200)
          const body = yield* Effect.promise(() => readJson(response))
          expect(body).toStrictEqual({ error: null, preview: true })
          const [, action] = upstream.mock.calls

          const requests = Array.map(([url, options]: Parameters<typeof fetch>) => {
            const headers = new Headers(options?.headers)

            return {
              authorization: headers.get('authorization'),
              b3: headers.get('b3'),
              cache: options?.cache,
              cookie: headers.get('cookie'),
              redirect: options?.redirect,
              traceparent: headers.get('traceparent'),
              url: url instanceof URL ? url.href : url,
            }
          })(upstream.mock.calls)

          const expectedRequest = {
            authorization: `Convex ${key}`,
            b3: null,
            cache: 'no-store',
            cookie: null,
            redirect: 'error',
            traceparent: null,
          }

          expect(requests).toStrictEqual([
            { ...expectedRequest, url: `${cloud}/api/v1/deployment_info` },
            { ...expectedRequest, url: `${cloud}/api/run/developmentEmail/send` },
          ])
          const actionBody = yield* Effect.promise(() => readJson(new Response(action?.[1]?.body)))
          expect(actionBody).toStrictEqual({
            args: { cloudUrl: cloud, email: address, origin },
            format: 'json',
          })

          const inbox = yield* Effect.promise(() => local(emailInboxPath))
          const inboxBody = yield* Effect.promise(() => readJson(inbox))
          expect(inboxBody).toStrictEqual({ emails: [{ ...message, id: '1' }] })
        }),
      ))

    it.each([
      [{ status: 'sent' }, 200],
      [{ status: 'failed' }, 503],
      [{ status: 'invalid' }, 400],
      [{ status: 'rateLimited' }, 429],
      [{ status: 'captured', email: { ...message, expiresAt: now } }, 503],
      [{ status: 'captured', email: { ...message, expiresAt: now + ttl + 1 } }, 503],
      [{ status: 'captured', email: { ...message, code: undefined } }, 503],
    ])('does not create a preview for provider results or invalid capture: %o', (value, expected) =>
      Effect.runPromise(
        Effect.gen(function* mapProviderReply() {
          upstream
            .mockResolvedValueOnce(Response.json(metadata))
            .mockResolvedValueOnce(Response.json({ status: 'success', value }))
          const response = yield* Effect.promise(() => post())
          expect(response.status).toBe(expected)
          const body = yield* Effect.promise(() => readJson(response))
          expect(body).toMatchObject({ preview: false })
          expect(readEmailInbox()).toStrictEqual([])
        }),
      ),
    )

    it('bounds a stalled outbound attestation and aborts the fetch', () =>
      Effect.runPromise(
        Effect.gen(function* boundAttestation() {
          let aborted = false
          upstream.mockImplementationOnce((_url, options) => {
            const { promise, reject } = Promise.withResolvers<Response>()

            options?.signal?.addEventListener(
              'abort',
              () => {
                aborted = true
                reject(new Error('test abort'))
              },
              { once: true },
            )

            return promise
          })

          const response = post()
          yield* Effect.promise(() => vi.advanceTimersByTimeAsync(3500))
          const result = yield* Effect.promise(() => response)
          expect(result.status).toBe(503)
          expect(aborted).toBeTruthy()
          expect(upstream).toHaveBeenCalledOnce()
        }),
      ))
  })

  it('shares ten newest previews and physically purges them without an inbox read', () =>
    Effect.runPromise(
      Effect.gen(function* expiry() {
        vi.useRealTimers()
        const deadline = (yield* Clock.currentTimeMillis) + 400

        for (let index = 1; index <= 12; index += 1) {
          expect(
            addEmailPreview({
              ...message,
              createdAt: deadline - ttl,
              expiresAt: deadline,
              subject: String(index),
            }),
          ).toBeTruthy()
        }

        const first = yield* Effect.promise(() => local(emailInboxPath))
        const second = yield* Effect.promise(() => local(emailInboxPath))
        const previews = readEmailInbox()
        expect(previews).toHaveLength(10)
        expect([previews[0]?.id, previews.at(-1)?.id]).toStrictEqual(['12', '3'])

        const [firstBody, secondBody] = yield* Effect.promise(() =>
          Promise.all([first.text(), second.text()]),
        )

        expect(firstBody).toBe(secondBody)
        yield* Effect.promise(() =>
          vi.waitFor(() => {
            expect(globalThis.affectDevEmailInbox).toMatchObject({ emails: [] })
            expect(globalThis.affectDevEmailInbox?.expiry).toBeUndefined()
          }),
        )
      }),
    ))
})
