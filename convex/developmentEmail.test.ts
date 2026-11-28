import { Schema } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { cloudflareFetch, email, request, requestVerificationOTP, setup } from '../tests/auth'
import { internal } from './_generated/api'
import { send } from './developmentEmail'

const cloudUrl = 'https://dev-fixture.convex.cloud'
const origin = 'http://localhost:3000'
const action = internal.developmentEmail.send
const args = { cloudUrl, email, origin }

const Captured = Schema.Struct({
  email: Schema.Struct({
    code: Schema.String,
    subject: Schema.String,
    text: Schema.String,
    to: Schema.String,
  }),
  status: Schema.Literal('captured'),
})

describe('private development email bridge', () => {
  beforeEach(() => {
    vi.stubEnv('PREVIEW_INBOX_SECRET', undefined)
    vi.stubEnv('PREVIEW_INBOX_CLOUD_URL', undefined)
    vi.stubEnv('CONVEX_CLOUD_URL', cloudUrl)
    vi.stubEnv('SITE_URL', origin)
    vi.stubEnv('TRUSTED_ORIGINS', origin)
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', '0123456789abcdef0123456789abcdef')
  })

  it('only captures through the authenticated preview bridge, even with provider settings', async () => {
    const preview = 'https://preview.example.test'
    const secret = 'synthetic-preview-secret-of-at-least-32-characters'
    vi.stubEnv('SITE_URL', preview)
    vi.stubEnv('TRUSTED_ORIGINS', preview)
    const t = setup()

    const sendPreview = (token: string) =>
      t.fetch('/affect-preview/email', {
        body: Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))({ email, origin: preview }),
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      })

    const withoutCapability = await sendPreview(secret)
    expect(withoutCapability.status).toBe(404)
    vi.stubEnv('PREVIEW_INBOX_SECRET', secret)
    vi.stubEnv('PREVIEW_INBOX_CLOUD_URL', cloudUrl)
    const wrongBearer = await sendPreview('wrong')
    expect(wrongBearer.status).toBe(404)
    const response = await sendPreview(secret)
    const captured = Schema.decodeUnknownSync(Captured)(await response.json())
    expect(captured.email.to).toBe(email)
    expect(cloudflareFetch).not.toHaveBeenCalled()
  })

  it.each([undefined, 'https://other-preview.convex.cloud'])(
    'delivers ordinary mail and hides the inbox outside the bound deployment (%s)',
    async (binding) => {
      const secret = 'synthetic-preview-secret-of-at-least-32-characters'
      vi.stubEnv('PREVIEW_INBOX_SECRET', secret)
      vi.stubEnv('PREVIEW_INBOX_CLOUD_URL', binding)
      const t = setup()

      const response = await t.fetch('/affect-preview/email', {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}` },
      })

      expect(response.status).toBe(404)
      const delivery = await requestVerificationOTP(t)
      expect(delivery.status).toBe(200)
      expect(cloudflareFetch).toHaveBeenCalledOnce()
    },
  )

  it('uses native verification for the captured code', async () => {
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', undefined)
    const t = setup()

    const captured = Schema.decodeUnknownSync(Captured)(await t.action(action, args))

    const response = await t.fetch('/api/auth/sign-in/email-otp', {
      ...request(),
      body: Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))({
        email,
        otp: captured.email.code,
      }),
    })

    expect(send.isInternal).toBeTruthy()
    expect(captured.email).toMatchObject({
      subject: 'Your Affect verification code',
      to: email,
    })
    expect(captured.email.text).toContain(captured.email.code)
    expect(response.status).toBe(200)
    expect(cloudflareFetch).not.toHaveBeenCalled()
  })

  it('shares the public endpoint recipient limiter and keeps its response private', async () => {
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', undefined)
    const t = setup()
    await t.action(action, args)
    await t.action(action, args)
    const ordinary = await requestVerificationOTP(t)

    await expect(ordinary.json()).resolves.toStrictEqual({ success: true })
    await expect(t.action(action, args)).resolves.toStrictEqual({
      status: 'rateLimited',
    })
  })

  it.each([
    {
      name: 'wrong target',
      override: { cloudUrl: 'https://wrong.convex.cloud' },
      site: origin,
    },
    {
      name: 'wrong origin',
      override: { origin: 'http://other.localhost' },
      site: origin,
    },
    {
      name: 'nonlocal configured origin',
      override: { origin: 'https://prod.example' },
      site: 'https://prod.example',
    },
  ])('rejects $name', async ({ override, site }) => {
    vi.stubEnv('SITE_URL', site)
    await expect(setup().action(action, { ...args, ...override })).resolves.toStrictEqual({
      status: 'unavailable',
    })
    expect(cloudflareFetch).not.toHaveBeenCalled()
  })

  it('accepts a trusted local worktree origin independently of the canonical site', async () => {
    const worktree = 'https://feature.affect.localhost'
    vi.stubEnv('TRUSTED_ORIGINS', worktree)
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', undefined)

    await expect(setup().action(action, { ...args, origin: worktree })).resolves.toMatchObject({
      status: 'captured',
    })
    expect(cloudflareFetch).not.toHaveBeenCalled()
  })

  it('sends configured mail and reports provider rejection without a preview', async () => {
    const t = setup()
    await expect(t.action(action, args)).resolves.toStrictEqual({
      status: 'sent',
    })
    cloudflareFetch.mockResolvedValueOnce(
      new Response('synthetic provider rejection', { status: 503 }),
    )
    await expect(t.action(action, args)).resolves.toStrictEqual({
      status: 'failed',
    })
    expect(cloudflareFetch).toHaveBeenCalledTimes(2)
  })
})
