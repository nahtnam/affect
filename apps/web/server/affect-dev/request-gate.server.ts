import { env } from 'node:process'

import { Option, Redacted, Schema, String } from 'effect'

import { isLocalDevelopmentOrigin } from '../../../../convex/lib/localDevelopment'

const DeploymentConfig = Schema.Struct({
  cloudUrl: Schema.String,
  key: Schema.RedactedFromValue(Schema.String),
  origin: Schema.String,
  siteUrl: Schema.String,
})

const validForwarding = (headers: Headers, origin: URL, portless: boolean) => {
  const peer = headers.get('x-forwarded-for')
  const host = headers.get('x-forwarded-host')
  const proto = headers.get('x-forwarded-proto')
  const port = headers.get('x-forwarded-port')
  const expectedPort = origin.port || (origin.protocol === 'https:' ? '443' : '80')

  // Portless appends the original peer. Require exactly one loopback hop.
  // The direct loopback listener needs no forwarding headers.
  return (
    headers.get('forwarded') === null &&
    (portless
      ? (peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1') &&
        host === origin.host &&
        `${proto}:` === origin.protocol &&
        port === expectedPort
      : peer === null && host === null && proto === null && port === null)
  )
}

const isLocalRuntime = () => {
  const { NODE_ENV, VERCEL_ENV, PORTLESS_LAN, PORTLESS_TAILSCALE_URL, PORTLESS_NGROK_URL } = env

  return (
    NODE_ENV === 'development' &&
    VERCEL_ENV === undefined &&
    PORTLESS_LAN !== '1' &&
    (PORTLESS_LAN === undefined || String.toLowerCase(PORTLESS_LAN) !== 'true') &&
    PORTLESS_TAILSCALE_URL === undefined &&
    PORTLESS_NGROK_URL === undefined
  )
}

const validFetch = (request: Request, origin: string) => {
  const { headers, method } = request
  const requestOrigin = headers.get('origin')
  const site = headers.get('sec-fetch-site')

  return (
    (requestOrigin === origin || (method === 'GET' && requestOrigin === null)) &&
    (site === null || site === 'same-origin') &&
    headers.get('sec-fetch-mode') !== 'navigate'
  )
}

export const getAffectDevTarget = ({
  request,
  method,
}: {
  request: Request
  method: 'GET' | 'POST'
}) => {
  if (request.method !== method || !isLocalRuntime()) {
    return null
  }

  const { CONVEX_DEPLOY_KEY, PORTLESS_URL, VITE_CONVEX_SITE_URL, VITE_CONVEX_URL, VITE_SITE_URL } =
    env

  const config = Schema.decodeUnknownOption(DeploymentConfig)({
    cloudUrl: VITE_CONVEX_URL,
    key: CONVEX_DEPLOY_KEY,
    origin: PORTLESS_URL ?? VITE_SITE_URL,
    siteUrl: VITE_CONVEX_SITE_URL,
  })

  if (Option.isNone(config)) {
    return null
  }

  const { cloudUrl, key, origin, siteUrl } = config.value
  const url = URL.parse(origin)
  const portless = PORTLESS_URL !== undefined
  const { headers } = request

  if (
    url === null ||
    url.origin !== origin ||
    !isLocalDevelopmentOrigin(url) ||
    (!portless && String.endsWith('.localhost')(url.hostname)) ||
    headers.get('host') !== url.host ||
    !validForwarding(headers, url, portless) ||
    !validFetch(request, origin)
  ) {
    return null
  }

  const slug = /^dev:(?<name>[a-z0-9-]+)\|[^\s|]+$/u.exec(Redacted.value(key))?.groups?.['name']

  if (
    slug === undefined ||
    cloudUrl !== `https://${slug}.convex.cloud` ||
    siteUrl !== `https://${slug}.convex.site`
  ) {
    return null
  }

  return { cloudUrl, key, origin }
}

export const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'Cross-Origin-Resource-Policy': 'same-origin',
}
