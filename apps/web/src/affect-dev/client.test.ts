import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { developmentEmailAvailable, fetchEmailInbox, sendDevelopmentCode } from './client'

const fetch = vi.fn<typeof globalThis.fetch>()

describe('development email browser transport', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { location: new URL('https://dock.localhost') })
    vi.stubGlobal('fetch', fetch)
  })

  afterEach(() => {
    fetch.mockReset()
    vi.unstubAllGlobals()
  })

  it('checks availability with the private same-origin fetch options', () => {
    fetch.mockResolvedValueOnce(Response.json({ available: true }))

    return developmentEmailAvailable().then((available) => {
      const [url, options] = fetch.mock.calls[0] ?? []
      expect(available).toBeTruthy()
      expect(url).toStrictEqual(new URL('https://dock.localhost/api/affect-dev/status'))
      expect(options).toMatchObject({
        cache: 'no-store',
        credentials: 'omit',
        headers: {},
        method: 'GET',
        mode: 'same-origin',
        redirect: 'error',
      })

      return available
    })
  })

  it('aborts the request when the inbox closes', () => {
    const started = Promise.withResolvers<AbortSignal>()
    const response = Promise.withResolvers<Response>()

    fetch.mockImplementationOnce((_, options) => {
      const signal = options?.signal

      if (signal === undefined || signal === null) {
        throw new Error('Expected the inbox request to be abortable.')
      }

      started.resolve(signal)

      return response.promise
    })

    const controller = new AbortController()
    const inbox = fetchEmailInbox(controller.signal)

    return started.promise.then((signal) => {
      controller.abort()
      expect(signal.aborted).toBeTruthy()

      return expect(inbox).rejects.toThrow('Could not load development email.')
    })
  })

  it('does not start a fetch for an already closed inbox', () =>
    expect(fetchEmailInbox(AbortSignal.abort()))
      .rejects.toThrow('Could not load development email.')
      .then(() => {
        expect(fetch).not.toHaveBeenCalled()

        return true
      }))

  it('returns the gated unavailable result for an inbox 404 without decoding a body', () => {
    fetch.mockResolvedValueOnce(new Response(null, { status: 404 }))

    return expect(fetchEmailInbox()).resolves.toStrictEqual({ kind: 'unavailable' })
  })

  it('keeps a 503 inbox response on the ordinary sanitized read error path', () => {
    fetch.mockResolvedValueOnce(Response.json({ error: 'synthetic failure' }, { status: 503 }))

    return expect(fetchEmailInbox()).rejects.toThrow('Could not load development email.')
  })

  it('preserves a typed rate limit response for the sign-in form', () => {
    const body = {
      error: { message: 'Too many requests. Please try again later.' },
      preview: false,
    }

    fetch.mockResolvedValueOnce(Response.json(body, { status: 429 }))

    return expect(sendDevelopmentCode('sample@example.test')).resolves.toStrictEqual(body)
  })
})
