import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { env as processEnvironment, execPath } from 'node:process'
import { fileURLToPath } from 'node:url'
import { Predicate, Schema, String as EffectString } from 'effect'
import { describe, expect, it } from 'vitest'

const host = '127.0.0.1'
const appRoot = fileURLToPath(new URL('../..', import.meta.url))

type Viewer = { email: string; id: string; isAdmin: boolean }

type FixtureReply =
  | { token: string }
  | { code: string }
  | { message: string }
  | { ts: string }
  | { status: 'error'; errorMessage: string }
  | { status: 'success'; value: Viewer | null }
  | null

const encodeReply = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))

const accounts = new Map<string, Viewer>([
  ['alpha', { email: 'alpha-ssr@example.test', id: 'fixture-alpha', isAdmin: true }],
  ['beta', { email: 'beta-ssr@example.test', id: 'fixture-beta', isAdmin: true }],
  ['member', { email: 'member-ssr@example.test', id: 'fixture-member', isAdmin: false }],
])

const listen = async (server: ReturnType<typeof createServer>) => {
  server.listen(0, host)
  await once(server, 'listening')

  const address = server.address()

  if (address === null || Predicate.isString(address)) {
    throw new Error('Expected a loopback fixture TCP listener.')
  }

  return address.port
}

const startBackendFixture = () => {
  let probes = 0

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', `http://${host}`)
    const actor = EffectString.replace('fixture=', '')(request.headers.cookie ?? '')

    const send = (status: number, value: FixtureReply) => {
      response.writeHead(status, { 'Content-Type': 'application/json' })

      response.end(encodeReply(value))
    }

    if (url.pathname === '/api/auth/convex/token') {
      probes += 1

      if (accounts.has(actor)) {
        send(200, { token: `fixture-not-a-jwt-${actor}` })

        return
      }

      send(401, { code: 'UNAUTHORIZED' })

      return
    }

    if (url.pathname === '/api/auth/get-session') {
      probes += 1

      if (actor === 'lookup-error') {
        send(500, { message: 'private-fixture-error' })

        return
      }

      send(200, null)

      return
    }

    if (url.pathname === '/api/query_ts') {
      send(200, { ts: 'fixture-timestamp' })

      return
    }

    if (url.pathname === '/api/query' || url.pathname === '/api/query_at_ts') {
      const principal = EffectString.replace(
        'Bearer fixture-not-a-jwt-',
        '',
      )(request.headers.authorization ?? '')

      const viewer = accounts.get(principal)

      if (url.pathname === '/api/query_at_ts' && viewer?.isAdmin !== true) {
        send(560, { errorMessage: 'fixture query unauthorized', status: 'error' })

        return
      }

      send(200, { status: 'success', value: viewer ?? null })

      return
    }

    send(404, null)
  })

  return { probes: () => probes, server }
}

const readPage = async (origin: string, path: string, actor?: string) => {
  const headers = new Headers({ Accept: 'text/html' })

  if (actor !== undefined) {
    headers.set('Cookie', `fixture=${actor}`)
  }

  const response = await fetch(origin + path, {
    headers,
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  })

  return {
    body: await response.text(),
    cache: response.headers.get('cache-control'),
    location: response.headers.get('location'),
    status: response.status,
  }
}

const redirectResult = (page: Awaited<ReturnType<typeof readPage>>) => ({
  cache: page.cache,
  location: page.location,
  status: page.status,
  restrictedContent: /Administration|Your account|Sign in to your account|@example\.test/u.test(
    page.body,
  ),
})

const expectedRedirect = (location: string) => ({
  cache: 'private, no-store',
  location,
  restrictedContent: false,
  status: 307,
})

const adminResult = (page: Awaited<ReturnType<typeof readPage>>, own: string, other: string) => ({
  cache: page.cache,
  ownEmailInHtml: new RegExp(`<p[^>]*>${own}-ssr@example\\.test</p>`, 'u').test(page.body),
  otherEmailPresent: EffectString.includes(`${other}-ssr@example.test`)(page.body),
  tokenPresent: EffectString.includes('fixture-not-a-jwt-')(page.body),
  status: page.status,
})

const expectedAdmin = {
  cache: 'private, no-store',
  otherEmailPresent: false,
  ownEmailInHtml: true,
  status: 200,
  tokenPresent: false,
}

describe('Start initial response', () => {
  it('authorizes the first document and isolates concurrent viewers before hydration', async () => {
    const fixture = startBackendFixture()
    const backendPort = await listen(fixture.server)
    const reservation = createServer()
    const port = await listen(reservation)
    reservation.close()

    const origin = `http://${host}:${port}`
    const backend = `http://${host}:${backendPort}`

    const { PORTLESS_URL: _portless, ...parentEnv } = processEnvironment

    const vite = spawn(execPath, ['node_modules/vite/bin/vite.js', 'dev', '--strictPort'], {
      cwd: appRoot,
      env: {
        ...parentEnv,
        CONVEX_DEPLOY_KEY: '',
        HOST: host,
        NODE_ENV: 'development',
        PORT: String(port),
        VITE_CONVEX_SITE_URL: backend,
        VITE_CONVEX_URL: backend,
        VITE_POSTHOG_HOST: '',
        VITE_POSTHOG_KEY: '',
        VITE_SITE_URL: origin,
      },
      stdio: 'ignore',
    })

    try {
      await expect
        .poll(
          async () => {
            try {
              const page = await readPage(origin, '/', 'alpha')

              return page.status
            } catch {
              return null
            }
          },
          { timeout: 12_000 },
        )
        .toBe(200)
      expect(fixture.probes()).toBe(0)

      const [signedOut, signedIn, denied, revoked, failed, alpha, beta, canonical, confirmed] =
        await Promise.all([
          readPage(origin, '/app?source=fixture'),
          readPage(origin, '/sign-in', 'alpha'),
          readPage(origin, '/admin', 'member'),
          readPage(origin, '/admin', 'revoked'),
          readPage(origin, '/sign-in', 'lookup-error'),
          readPage(origin, '/admin', 'alpha'),
          readPage(origin, '/admin', 'beta'),
          readPage(origin, '/sign-in?returnTo=//evil.example'),
          readPage(origin, '/sign-in', 'revoked'),
        ])

      expect({
        alpha: adminResult(alpha, 'alpha', 'beta'),
        beta: adminResult(beta, 'beta', 'alpha'),
        canonical: redirectResult(canonical),
        confirmed: {
          status: confirmed.status,
          form: /<input[^>]+name="email"/u.test(confirmed.body),
        },
        denied: redirectResult(denied),
        failed: {
          cache: failed.cache,
          restrictedContent: /Sign in to your account|private-fixture-error/u.test(failed.body),
          status: failed.status,
        },
        revoked: redirectResult(revoked),
        signedIn: redirectResult(signedIn),
        signedOut: redirectResult(signedOut),
      }).toStrictEqual({
        alpha: expectedAdmin,
        beta: expectedAdmin,
        canonical: expectedRedirect('/sign-in?returnTo=%2Fapp'),
        confirmed: { status: 200, form: true },
        denied: expectedRedirect('/app'),
        failed: { cache: 'private, no-store', restrictedContent: false, status: 500 },
        revoked: expectedRedirect('/sign-in?returnTo=%2Fadmin'),
        signedIn: expectedRedirect('/app'),
        signedOut: expectedRedirect('/sign-in?returnTo=%2Fapp%3Fsource%3Dfixture'),
      })
    } finally {
      vite.kill('SIGTERM')
      fixture.server.close()
    }
  }, 30_000)
})
