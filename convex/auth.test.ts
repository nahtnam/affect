import { MINUTE } from '@convex-dev/rate-limiter'
import { ConvexError } from 'convex/values'
import { Effect, Order, Schema } from 'effect'
import { map, sort } from 'effect/Array'
import { describe, expect, it, vi } from 'vitest'

import {
  adminListUsers,
  cloudflareFetch,
  cloudflareSuccess,
  cloudflareUrl,
  email,
  issueIdentity,
  request,
  requestCode,
  requestVerificationOTP,
  Session,
  setup,
  signIn,
  updateBetterAuth,
} from '../tests/auth'
import { api, components } from './_generated/api'
import { requirePlatformAdmin } from './auth'

describe('authentication', () => {
  describe('OTP sign-in', () => {
    it('delivers a code, persists a session, and reuses the account on later sign-in', async () => {
      const t = setup()
      const { body, cookie, delivery } = await signIn(t)
      const { claims, viewer } = await issueIdentity(t, cookie)
      expect({
        authorization: delivery.outbound.headers.get('authorization'),
        from: delivery.payload.from,
        method: delivery.outbound.method,
        status: delivery.response.status,
        to: delivery.payload.to,
        url: delivery.outbound.url,
      }).toStrictEqual({
        authorization: 'Bearer cf_test_token',
        from: 'Affect Auth <auth@example.com>',
        method: 'POST',
        status: 200,
        to: email,
        url: cloudflareUrl,
      })
      expect(delivery.payload.text).toContain('5 minutes')

      const session = await t.fetch('/api/auth/get-session', {
        headers: { cookie },
      })

      expect({
        claims,
        email: body.user.email,
        session: Schema.decodeUnknownSync(Session)(await session.json()),
      }).toStrictEqual({
        claims: {
          iss: 'https://test.convex.site',
          sessionId: claims.sessionId,
          sub: body.user.id,
        },
        email,
        session: body,
      })
      await expect(viewer.query(api.auth.currentUser)).resolves.toStrictEqual({
        email,
        id: body.user.id,
        isAdmin: false,
      })
      const returning = await signIn(t)
      expect(returning.body.user.id).toBe(body.user.id)
    })

    it('stores a hash instead of the plaintext OTP', async () => {
      const t = setup()
      const { otp } = await requestCode(t)

      const verification = await t.run(async (ctx) =>
        Schema.decodeUnknownSync(Schema.Struct({ value: Schema.String }))(
          await ctx.runQuery(components.betterAuth.adapter.findOne, {
            model: 'verification',
            where: [{ field: 'identifier', value: `sign-in-otp-${email}` }],
          }),
        ),
      )

      expect(verification.value).not.toContain(otp)
    })

    it('limits a recipient to three sends and preserves the last delivered OTP', async () => {
      const now = Date.now()
      vi.spyOn(Date, 'now').mockReturnValue(now)

      const t = setup()
      await requestCode(t)
      await expect(requestVerificationOTP(t)).resolves.toHaveProperty('status', 200)
      const lastDelivery = await requestCode(t)
      const denied = await requestVerificationOTP(t)

      expect({
        deniedStatus: denied.status,
        providerRequests: cloudflareFetch.mock.calls.length,
        retryAfter: denied.headers.get('retry-after'),
      }).toMatchObject({
        deniedStatus: 429,
        providerRequests: 3,
      })
      expect(Number(denied.headers.get('retry-after'))).toBeGreaterThan(0)

      const signInResponse = await t.fetch('/api/auth/sign-in/email-otp', {
        ...request(),
        body: Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))({
          email,
          otp: lastDelivery.otp,
        }),
      })

      expect(signInResponse.status).toBe(200)
    })

    it('counts concurrent requests transactionally and ignores spoofed IP headers', async () => {
      const now = Date.now()
      vi.spyOn(Date, 'now').mockReturnValue(now)

      const t = setup()

      const attempts = [
        ['Case@Test-OTP.com', '203.0.113.1'],
        ['case@test-otp.com', '203.0.113.2'],
        ['CASE@TEST-OTP.COM', '203.0.113.3'],
        ['case@Test-otp.com', '203.0.113.4'],
      ] as const

      const responses = await Promise.all(
        map(attempts, ([address, ip]) =>
          requestVerificationOTP(t, address, { 'x-forwarded-for': ip }),
        ),
      )

      expect(sort(Order.Number)(map(responses, (response) => response.status))).toStrictEqual([
        200, 200, 200, 429,
      ])
      expect(cloudflareFetch).toHaveBeenCalledTimes(3)

      const anotherRecipient = await requestVerificationOTP(t, 'another-otp@example.com', {
        'x-forwarded-for': '203.0.113.4',
      })

      expect(anotherRecipient.status).toBe(200)
      expect(cloudflareFetch).toHaveBeenCalledTimes(4)
    })

    it('shares the recipient budget across password-reset aliases', async () => {
      const now = Date.now()
      vi.spyOn(Date, 'now').mockReturnValue(now)

      const t = setup()

      const body = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))({
        email: 'reset-alias@example.com',
      })

      const send = (path: string) => t.fetch(path, { ...request(), body })

      await send('/api/auth/email-otp/request-password-reset')
      await send('/api/auth/forget-password/email-otp')
      await send('/api/auth/email-otp/request-password-reset')
      const denied = await send('/api/auth/forget-password/email-otp')

      expect(denied.status).toBe(429)
      expect(Number(denied.headers.get('retry-after'))).toBeGreaterThan(0)
    })

    it('allows a recipient again in a later fixed window', async () => {
      const now = Date.now()
      vi.spyOn(Date, 'now').mockReturnValue(now)

      const t = setup()
      await Promise.all(map([1, 2, 3], () => requestVerificationOTP(t)))

      vi.spyOn(Date, 'now').mockReturnValue(now + 2 * MINUTE)
      const later = await requestVerificationOTP(t)

      expect(later.status).toBe(200)
      expect(cloudflareFetch).toHaveBeenCalledTimes(4)
    })
  })

  describe('Cloudflare delivery', () => {
    it('accepts queued delivery to the requested recipient', async () => {
      cloudflareFetch.mockResolvedValueOnce(Response.json(cloudflareSuccess('queued')))
      const { response } = await requestCode(setup())
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toStrictEqual({ success: true })
    })

    it('acknowledges provider HTTP failures without leaking details', async () => {
      cloudflareFetch.mockResolvedValueOnce(
        Response.json(
          {
            ...cloudflareSuccess(),
            errors: [{ message: 'provider-secret-error' }],
          },
          { status: 503 },
        ),
      )
      const t = setup()
      const { otp, response } = await requestCode(t)

      expect(response.status).toBe(200)
      const responseBody = await response.text()
      expect(responseBody).toBe('{"success":true}')

      for (const secret of ['provider-secret-error', 'cf_test_token', email, otp]) {
        expect(responseBody).not.toContain(secret)
      }
    })
  })

  describe('Platform authorization and session revocation', () => {
    it('preserves native unauthenticated errors', async () => {
      const t = setup()

      const denied = t.run((ctx) => Effect.runPromise(requirePlatformAdmin(ctx)))

      await expect(denied).rejects.toBeInstanceOf(ConvexError)
      await expect(denied).rejects.toThrow('Unauthenticated')
    })

    it('defaults OTP users to the user role and ignores client role claims', async () => {
      const t = setup()
      const { otp } = await requestCode(t)

      const maliciousSignIn = await t.fetch('/api/auth/sign-in/email-otp', {
        ...request(),
        body: Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))({
          email,
          otp,
          role: 'admin',
        }),
      })

      expect(maliciousSignIn.status).toBe(400)

      const { body, cookie } = await signIn(t)
      const { viewer } = await issueIdentity(t, cookie)

      expect(body.user.role).toBe('user')
      await expect(viewer.query(api.auth.currentUser)).resolves.toStrictEqual({
        email,
        id: body.user.id,
        isAdmin: false,
      })
    })

    it('denies unauthenticated and ordinary users from admin queries and APIs', async () => {
      const t = setup()
      await expect(t.query(api.admin.viewer)).rejects.toThrow('Unauthenticated')
      const unauthenticatedUsers = await adminListUsers(t)
      expect(unauthenticatedUsers.status).toBe(401)

      const { body, cookie } = await signIn(t)
      const { viewer } = await issueIdentity(t, cookie)
      await expect(viewer.query(api.admin.viewer)).rejects.toThrow(
        'Platform admin access required.',
      )
      const ordinaryUsers = await adminListUsers(t, cookie)
      expect(ordinaryUsers.status).toBe(403)

      const selfElevation = await t.fetch('/api/auth/admin/update-user', {
        ...request(cookie),
        body: Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))({
          data: { role: 'admin' },
          userId: body.user.id,
        }),
      })

      expect(selfElevation.status).toBe(403)
    })

    it('does not allow profile updates to elevate an ordinary user', async () => {
      const t = setup()
      const { body, cookie } = await signIn(t)
      const { viewer } = await issueIdentity(t, cookie)

      const profileUpdate = await t.fetch('/api/auth/update-user', {
        ...request(cookie),
        body: Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))({
          name: 'OTP User',
          role: 'admin',
        }),
      })

      expect(profileUpdate.status).toBeLessThan(500)
      await expect(viewer.query(api.auth.currentUser)).resolves.toMatchObject({
        email,
        id: body.user.id,
        isAdmin: false,
      })
    })

    it('accepts a promoted admin and immediately rejects a downgraded identity', async () => {
      const t = setup()
      const { body, cookie } = await signIn(t)
      const { viewer } = await issueIdentity(t, cookie)

      await updateBetterAuth(t, {
        id: body.user.id,
        model: 'user',
        update: { role: 'admin' },
      })
      await expect(viewer.query(api.auth.currentUser)).resolves.toStrictEqual({
        email,
        id: body.user.id,
        isAdmin: true,
      })
      await expect(viewer.query(api.admin.viewer)).resolves.toStrictEqual({
        email,
        id: body.user.id,
      })
      const promotedUsers = await adminListUsers(t, cookie)

      await updateBetterAuth(t, {
        id: body.user.id,
        model: 'user',
        update: { role: 'user' },
      })
      await expect(viewer.query(api.auth.currentUser)).resolves.toStrictEqual({
        email,
        id: body.user.id,
        isAdmin: false,
      })
      await expect(viewer.query(api.admin.viewer)).rejects.toThrow(
        'Platform admin access required.',
      )
      const downgradedUsers = await adminListUsers(t, cookie)
      expect([promotedUsers.status, downgradedUsers.status]).toStrictEqual([200, 403])
    })

    it.each(['expired session', 'deleted user'] as const)(
      'rejects an issued identity for a %s',
      async (reason) => {
        const t = setup()
        const { body, cookie } = await signIn(t)
        const { claims, viewer } = await issueIdentity(t, cookie)
        await updateBetterAuth(t, {
          id: body.user.id,
          model: 'user',
          update: { role: 'admin' },
        })
        await expect(viewer.query(api.admin.viewer)).resolves.toStrictEqual({
          email,
          id: body.user.id,
        })

        if (reason === 'expired session') {
          await updateBetterAuth(t, {
            id: claims.sessionId,
            model: 'session',
            update: { expiresAt: Date.now() - 1 },
          })
        } else if (reason === 'deleted user') {
          await t.run(async (ctx) => {
            await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
              input: {
                model: 'user',
                where: [{ field: '_id', operator: 'eq', value: body.user.id }],
              },
            })
          })
        }

        await expect(viewer.query(api.auth.currentUser)).resolves.toBeNull()
        await expect(viewer.query(api.admin.viewer)).rejects.toThrow('Unauthenticated')
      },
    )

    it("revokes a banned user's session through the admin endpoint", async () => {
      const t = setup()
      const targetSession = await signIn(t)
      const targetIdentity = await issueIdentity(t, targetSession.cookie)
      const adminSession = await signIn(t, 'admin@example.com')
      const adminIdentity = await issueIdentity(t, adminSession.cookie)

      await updateBetterAuth(t, {
        id: adminSession.body.user.id,
        model: 'user',
        update: { role: 'admin' },
      })
      await expect(adminIdentity.viewer.query(api.admin.viewer)).resolves.toStrictEqual({
        email: 'admin@example.com',
        id: adminSession.body.user.id,
      })

      const banResponse = await t.fetch('/api/auth/admin/ban-user', {
        ...request(adminSession.cookie),
        body: Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))({
          banReason: 'test',
          userId: targetSession.body.user.id,
        }),
      })

      expect(banResponse.status).toBe(200)
      await expect(targetIdentity.viewer.query(api.auth.currentUser)).resolves.toBeNull()
      await expect(targetIdentity.viewer.query(api.admin.viewer)).rejects.toThrow('Unauthenticated')
    })

    it('revokes the session on sign-out, including an already-issued Convex token', async () => {
      const t = setup()
      const { body, cookie } = await signIn(t)
      const { viewer } = await issueIdentity(t, cookie)
      await updateBetterAuth(t, {
        id: body.user.id,
        model: 'user',
        update: { role: 'admin' },
      })
      await expect(viewer.query(api.admin.viewer)).resolves.toStrictEqual({
        email,
        id: body.user.id,
      })

      const signOutResponse = await t.fetch('/api/auth/sign-out', request(cookie))

      expect(signOutResponse.status).toBe(200)

      const session = await t.fetch('/api/auth/get-session', {
        headers: { cookie },
      })

      await expect(session.json()).resolves.toBeNull()
      await expect(viewer.query(api.auth.currentUser)).resolves.toBeNull()
      await expect(viewer.query(api.admin.viewer)).rejects.toThrow('Unauthenticated')
    })
  })
})
