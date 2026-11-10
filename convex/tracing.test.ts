import { Schema, String } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  cloudflareFetch,
  cloudflareFixtureFetch,
  cloudflareSuccess,
  email,
  requestCode,
  setup,
} from '../tests/auth'
import { internal } from './_generated/api'

const collectorUrl = 'https://telemetry.example'
const projectToken = 'phc_test_project_token'
const telemetryRequests: Request[] = []

const installCollector = (behavior: 'failure' | 'success') => {
  vi.stubGlobal('fetch', (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const capturedRequest = new Request(input, init)

    if (String.startsWith(`${collectorUrl}/`)(capturedRequest.url)) {
      telemetryRequests.push(capturedRequest)

      if (behavior === 'failure') {
        throw new Error('synthetic collector failure')
      }

      return Response.json({})
    }

    return cloudflareFixtureFetch(input, init)
  })
}

const latestTelemetryBody = async () => {
  const capturedRequest = telemetryRequests.at(-1)

  if (capturedRequest === undefined) {
    throw new Error('Telemetry request was not made')
  }

  return new TextDecoder().decode(await capturedRequest.arrayBuffer())
}

describe('optional Convex tracing', () => {
  afterEach(() => {
    telemetryRequests.length = 0
    vi.stubGlobal('fetch', cloudflareFixtureFetch)
  })

  it('flushes enabled auth callback spans as protobuf before email delivery returns', async () => {
    vi.stubEnv('POSTHOG_HOST', collectorUrl)
    vi.stubEnv('POSTHOG_PROJECT_TOKEN', projectToken)
    installCollector('success')

    const delivery = await requestCode(setup())
    const body = await latestTelemetryBody()
    const [telemetryRequest] = telemetryRequests

    expect(delivery.response.status).toBe(200)
    expect(cloudflareFetch).toHaveBeenCalledOnce()

    if (telemetryRequest === undefined) {
      throw new Error('Telemetry request was not made')
    }

    expect({
      authorization: telemetryRequest.headers.get('authorization'),
      contentType: telemetryRequest.headers.get('content-type'),
      method: telemetryRequest.method,
      url: telemetryRequest.url,
    }).toStrictEqual({
      authorization: `Bearer ${projectToken}`,
      contentType: 'application/x-protobuf',
      method: 'POST',
      url: `${collectorUrl}/i/v1/traces`,
    })
    expect({
      hasCloudflareEndpoint: String.includes('api.cloudflare.com')(body),
      hasOperation: String.includes('sendVerificationCode')(body),
      hasPostChild: String.includes('POST')(body),
      hasService: String.includes('affect-convex')(body),
      includesCloudflareToken: String.includes('cf_test_token')(body),
      includesEmail: String.includes(email)(body),
      includesOtp: String.includes(delivery.otp)(body),
      includesProjectToken: String.includes(projectToken)(body),
    }).toStrictEqual({
      hasCloudflareEndpoint: true,
      hasOperation: true,
      hasPostChild: true,
      hasService: true,
      includesCloudflareToken: false,
      includesEmail: false,
      includesOtp: false,
      includesProjectToken: false,
    })
  })

  it.each([
    { host: '', name: 'disabled configuration', token: '' },
    { host: 'not-a-url', name: 'a malformed host' },
  ])('keeps email delivery working with $name', async ({ host, token = projectToken }) => {
    vi.stubEnv('POSTHOG_HOST', host)
    vi.stubEnv('POSTHOG_PROJECT_TOKEN', token)
    installCollector('success')

    const delivery = await requestCode(setup())

    expect(delivery.response.status).toBe(200)
    expect(delivery.otp).toMatch(/^\d{6}$/u)
    expect(cloudflareFetch).toHaveBeenCalledOnce()
    expect(telemetryRequests).toHaveLength(0)
  })

  it('does not report collector failures to Better Auth', async () => {
    vi.stubEnv('POSTHOG_HOST', collectorUrl)
    vi.stubEnv('POSTHOG_PROJECT_TOKEN', projectToken)
    installCollector('failure')

    const errorSpy = vi.spyOn(console, 'error')
    const t = setup()
    const errorsBeforeRequest = errorSpy.mock.calls.length
    const delivery = await requestCode(t)

    expect(delivery.response.status).toBe(200)
    expect(telemetryRequests.length).toBeGreaterThan(0)
    expect(errorSpy).toHaveBeenCalledTimes(errorsBeforeRequest)
  })

  it('exports a sanitized error when the provider rejects the recipient', async () => {
    vi.stubEnv('POSTHOG_HOST', collectorUrl)
    vi.stubEnv('POSTHOG_PROJECT_TOKEN', projectToken)
    installCollector('success')
    cloudflareFetch.mockResolvedValueOnce(
      Response.json({
        ...cloudflareSuccess('delivered', 'other@example.com'),
        errors: [{ message: 'provider-secret-error' }],
      }),
    )

    const errorSpy = vi.spyOn(console, 'error')
    const t = setup()
    const errorsBeforeRequest = errorSpy.mock.calls.length
    const delivery = await requestCode(t)
    const body = await latestTelemetryBody()

    expect(delivery.response.status).toBe(200)
    expect(errorSpy.mock.calls.length).toBeGreaterThan(errorsBeforeRequest)
    expect({
      hasSanitizedError: String.includes('Could not send sign-in code.')(body),
      includesCloudflareToken: String.includes('cf_test_token')(body),
      includesEmail: String.includes(email)(body),
      includesOtp: String.includes(delivery.otp)(body),
      includesProjectToken: String.includes(projectToken)(body),
      includesProviderError: String.includes('provider-secret-error')(body),
    }).toStrictEqual({
      hasSanitizedError: true,
      includesCloudflareToken: false,
      includesEmail: false,
      includesOtp: false,
      includesProjectToken: false,
      includesProviderError: false,
    })
  })

  it("keeps the private capture callback's preview out of exported spans", async () => {
    const cloudUrl = 'https://dev-fixture.convex.cloud'
    vi.stubEnv('CONVEX_CLOUD_URL', cloudUrl)
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', undefined)
    vi.stubEnv('POSTHOG_HOST', collectorUrl)
    vi.stubEnv('POSTHOG_PROJECT_TOKEN', projectToken)
    installCollector('success')

    const result: unknown = await setup().action(internal.developmentEmail.send, {
      cloudUrl,
      email,
      origin: 'http://localhost:3000',
    })

    const capture = Schema.decodeUnknownSync(
      Schema.Struct({
        email: Schema.Struct({ code: Schema.String }),
        status: Schema.Literal('captured'),
      }),
    )(result)

    const body = await latestTelemetryBody()

    expect(cloudflareFetch).not.toHaveBeenCalled()
    expect({
      hasOperation: String.includes('sendVerificationCode')(body),
      includesCloudflareToken: String.includes('cf_test_token')(body),
      includesEmail: String.includes(email)(body),
      includesOtp: String.includes(capture.email.code)(body),
      includesProjectToken: String.includes(projectToken)(body),
    }).toStrictEqual({
      hasOperation: true,
      includesCloudflareToken: false,
      includesEmail: false,
      includesOtp: false,
      includesProjectToken: false,
    })
  })
})
