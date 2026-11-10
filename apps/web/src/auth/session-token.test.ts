import { Array as EffectArray, Effect } from 'effect'
import { describe, expect, it, vi } from 'vitest'

import { readSessionToken } from './session-token.server'

const site = 'https://fixture.convex.site'
const origin = 'https://affect.localhost'
const { signal } = new AbortController()
const fixtureCookie = '__Secure-better-auth.session_token=synthetic'

const lookup = {
  siteUrl: site,
  browserOrigin: origin,
  cookie: fixtureCookie,
  signal,
}

describe('server identity lookup', () => {
  it('confirms a token 401 with the native session endpoint', async () => {
    const endpoint = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json(null))

    const request = new AbortController()

    await expect(
      Effect.runPromise(
        readSessionToken({ ...lookup, signal: request.signal, fetchEndpoint: endpoint }),
      ),
    ).resolves.toBeNull()
    expect(
      EffectArray.map(([url]: Parameters<typeof fetch>): string => {
        if (url instanceof URL) {
          return url.href
        }

        if (url instanceof Request) {
          return url.url
        }

        return url
      })(endpoint.mock.calls),
    ).toStrictEqual([
      `${site}/api/auth/convex/token?disableCookieCache=true&disableRefresh=true`,
      `${site}/api/auth/get-session?disableCookieCache=true&disableRefresh=true`,
    ])

    const tokenRequest = endpoint.mock.calls[0]?.[1]
    const sessionRequest = endpoint.mock.calls[1]?.[1]

    expect(tokenRequest?.signal).toBeInstanceOf(AbortSignal)
    expect(sessionRequest?.signal).toBe(tokenRequest?.signal)
    request.abort()
    expect(tokenRequest?.signal?.aborted).toBeTruthy()
  })

  it('fails closed when the same token 401 masks an adapter error', async () => {
    const endpoint = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        Response.json({ message: 'fixture private adapter failure' }, { status: 500 }),
      )

    await expect(
      Effect.runPromise(readSessionToken({ ...lookup, fetchEndpoint: endpoint })),
    ).rejects.toThrow(/^Could not verify your session\. Please try again\.$/u)
  })

  it('does not interpret a live session with no usable token as signed out', async () => {
    const endpoint = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ session: {}, user: {} }))

    await expect(
      Effect.runPromise(readSessionToken({ ...lookup, fetchEndpoint: endpoint })),
    ).rejects.toThrow('Could not verify your session.')
  })
})
