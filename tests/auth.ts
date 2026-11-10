/// <reference types="vite/client" />

import { register as registerRateLimiter } from '@convex-dev/rate-limiter/test'
import { convexTest } from 'convex-test'
import { Schema, String } from 'effect'
import { afterAll, afterEach, beforeEach, vi } from 'vitest'

import { components } from '../convex/_generated/api'
import type { Doc } from '../convex/betterAuth/_generated/dataModel'
import betterAuthSchema from '../convex/betterAuth/schema'
import schema from '../convex/schema'

vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret-that-is-long-enough-for-auth')

vi.stubEnv('SITE_URL', 'http://localhost:3000')

vi.stubEnv('TRUSTED_ORIGINS', 'http://localhost:3000')

vi.stubEnv('CONVEX_SITE_URL', 'https://test.convex.site')

vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', '0123456789abcdef0123456789abcdef')

vi.stubEnv('CLOUDFLARE_API_TOKEN', 'cf_test_token')

vi.stubEnv('EMAIL_FROM', ' Affect Auth <auth@example.com> ')

vi.stubEnv('POSTHOG_PROJECT_TOKEN', '')

export const cloudflareFetch = vi.fn<typeof fetch>()

export const cloudflareFixtureFetch = async (
  input: Parameters<typeof fetch>[0],
  init?: RequestInit,
) => {
  const url = input instanceof Request ? input.url : input.toString()

  if (String.startsWith('https://api.cloudflare.com/')(url)) {
    const response = await cloudflareFetch(input, init)

    return response.clone()
  }

  throw new Error(`Unexpected request: ${url}`)
}

vi.stubGlobal('fetch', cloudflareFixtureFetch)

const modules = import.meta.glob([
  '../convex/**/*.ts',
  '!../convex/betterAuth/**/*.ts',
  '!../convex/**/*.test.ts',
])

const betterAuthModules = import.meta.glob('../convex/betterAuth/**/*.ts')

export const email = 'otp-test@example.com'

export const cloudflareUrl =
  'https://api.cloudflare.com/client/v4/accounts/0123456789abcdef0123456789abcdef/email/sending/send'

export const Session = Schema.Struct({
  user: Schema.Struct({
    email: Schema.String,
    id: Schema.String,
    role: Schema.optional(Schema.String),
  }),
})

const Token = Schema.Struct({ token: Schema.String })

const Claims = Schema.Struct({
  iss: Schema.String,
  sessionId: Schema.String,
  sub: Schema.String,
})

const CloudflareRequest = Schema.Struct({
  from: Schema.String,
  subject: Schema.String,
  text: Schema.String,
  to: Schema.String,
})

export const cloudflareSuccess = (
  accepted: 'delivered' | 'queued' = 'delivered',
  recipient = email,
) => ({
  result: {
    delivered: accepted === 'delivered' ? [recipient] : [],
    queued: accepted === 'queued' ? [recipient] : [],
  },
  success: true,
})

const latestCloudflareRequest = async () => {
  const call = cloudflareFetch.mock.calls.at(-1)

  if (call === undefined) {
    throw new Error('Cloudflare email request was not made')
  }

  const outbound = new Request(...call)

  const payload = Schema.decodeUnknownSync(CloudflareRequest)(await outbound.json())

  return { outbound, payload }
}

export const setup = () => {
  const t = convexTest(schema, modules)
  t.registerComponent('betterAuth', betterAuthSchema, betterAuthModules)
  registerRateLimiter(t)

  return t
}

type Backend = ReturnType<typeof setup>

export const request = (cookie?: string): RequestInit => {
  const headers = new Headers({
    'content-type': 'application/json',
    origin: 'http://localhost:3000',
  })

  if (cookie !== undefined && cookie !== '') {
    headers.set('cookie', cookie)
  }

  return { headers, method: 'POST' }
}

export const requestVerificationOTP = (
  t: Backend,
  address = email,
  headers?: { 'x-forwarded-for'?: string },
) => {
  const init = request()
  const requestHeaders = new Headers(init.headers)

  if (headers?.['x-forwarded-for'] !== undefined) {
    requestHeaders.set('x-forwarded-for', headers['x-forwarded-for'])
  }

  return t.fetch('/api/auth/email-otp/send-verification-otp', {
    ...init,
    body: Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))({
      email: address,
      type: 'sign-in',
    }),
    headers: requestHeaders,
  })
}

export const requestCode = async (t: Backend, address = email) => {
  const sendResponse = await requestVerificationOTP(t, address)

  const cloudflareRequest = await latestCloudflareRequest()

  const otp = /\b(?<otp>\d{6})\b/u.exec(cloudflareRequest.payload.text)?.groups?.['otp']

  if (otp === undefined || otp === '') {
    throw new Error('Cloudflare email request has no six-digit OTP')
  }

  return { ...cloudflareRequest, otp, response: sendResponse }
}

export const signIn = async (t: Backend, address = email) => {
  const delivery = await requestCode(t, address)

  const signInResponse = await t.fetch('/api/auth/sign-in/email-otp', {
    ...request(),
    body: Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))({
      email: address,
      otp: delivery.otp,
    }),
  })

  const body = Schema.decodeUnknownSync(Session)(await signInResponse.json())

  const [cookie] = String.split(signInResponse.headers.get('set-cookie') ?? '', ';')

  if (cookie === '') {
    throw new Error('Sign-in did not set a session cookie')
  }

  return { body, cookie, delivery }
}

export const issueIdentity = async (t: Backend, cookie: string) => {
  const tokenResponse = await t.fetch('/api/auth/convex/token', {
    headers: { cookie },
  })

  const { token } = Schema.decodeUnknownSync(Token)(await tokenResponse.json())

  const claims = Schema.decodeSync(Schema.fromJsonString(Claims))(
    Schema.decodeSync(Schema.StringFromBase64Url)(String.split(token, '.')[1] ?? ''),
  )

  return {
    claims,
    viewer: t.withIdentity({
      issuer: claims.iss,
      sessionId: claims.sessionId,
      subject: claims.sub,
    }),
  }
}

export const updateBetterAuth = async (
  t: Backend,
  input: {
    id: string
  } & (
    | {
        model: 'user'
        update: Partial<Omit<Doc<'user'>, '_id' | '_creationTime'>>
      }
    | {
        model: 'session'
        update: Partial<Omit<Doc<'session'>, '_id' | '_creationTime'>>
      }
  ),
) => {
  const { id, ...value } = input

  await t.run(async (ctx) => {
    await ctx.runMutation(components.betterAuth.adapter.updateOne, {
      input: {
        ...value,
        where: [{ field: '_id', operator: 'eq', value: id }],
      },
    })
  })
}

export const adminListUsers = (t: Backend, cookie?: string) => {
  const init = request(cookie)

  return t.fetch('/api/auth/admin/list-users', {
    ...init,
    method: 'GET',
  })
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {
    // Capture the safe Effect diagnostic without printing expected failures.
  })
  cloudflareFetch.mockReset().mockImplementation(async (input, init) => {
    const outboundRequest = new Request(input, init)

    const body = Schema.decodeUnknownSync(Schema.Struct({ to: Schema.String }))(
      await outboundRequest.json(),
    )

    return Response.json(cloudflareSuccess('delivered', body.to))
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})
