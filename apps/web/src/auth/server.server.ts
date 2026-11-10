import { convexBetterAuthReactStart } from '@convex-dev/better-auth/react-start'
import { getRequest } from '@tanstack/react-start/server'
import type { ConvexHttpClient } from 'convex/browser'
import { Effect } from 'effect'

import { env } from '#/env'
import { api } from '@convex/_generated/api'

import { authOrigin } from './auth-origin.server'
import { privateHeaders } from './private-headers'
import { identityUnavailable, readSessionToken } from './session-token.server'

const { handler } = convexBetterAuthReactStart({
  convexSiteUrl: env.VITE_CONVEX_SITE_URL,
  convexUrl: env.VITE_CONVEX_URL,
})

export const handleAuth = async (request: Request) => {
  const canonicalOrigin = new URL(authOrigin())
  const incoming = new URL(request.url)

  if (incoming.host !== canonicalOrigin.host) {
    return new Response(null, { headers: privateHeaders, status: 404 })
  }

  incoming.protocol = canonicalOrigin.protocol

  // Rebase the URL without changing the real browser Origin or the cookie/body.
  const init = {
    body: request.body,
    duplex: 'half',
    headers: request.headers,
    method: request.method,
    signal: request.signal,
  } satisfies RequestInit & { duplex: 'half' }

  const upstream = await handler(new Request(incoming, init))
  const headers = new Headers(upstream.headers)
  headers.set('Cache-Control', privateHeaders['Cache-Control'])

  return new Response(upstream.body, {
    headers,
    status: upstream.status,
    statusText: upstream.statusText,
  })
}

export const readViewer = async (client: ConvexHttpClient) => {
  const request = getRequest()

  try {
    const token = await Effect.runPromise(
      readSessionToken({
        siteUrl: env.VITE_CONVEX_SITE_URL,
        browserOrigin: authOrigin(),
        cookie: request.headers.get('cookie'),
        signal: request.signal,
      }),
    )

    if (token === null) {
      return null
    }

    client.setAuth(token)

    // Establish the viewer from a fresh request before using the Query cache.
    return await client.query(api.auth.currentUser, {})
  } catch {
    throw identityUnavailable()
  }
}
