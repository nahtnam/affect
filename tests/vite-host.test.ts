import { resolveConfig } from 'vite'
import { describe, expect, it } from 'vitest'
import {
  createLoopbackHostGuard,
  normalizePortlessConnection,
} from '../apps/web/vite/loopback-host-guard'
import { resolveServerOptions } from '../apps/web/vite/server-options'

const root = new URL('../apps/web/', import.meta.url).pathname

describe('Vite development host guard', () => {
  it('accepts a loopback CLI host override', () =>
    expect(
      resolveConfig(
        {
          configFile: false,
          root,
          plugins: [createLoopbackHostGuard(undefined)],
          server: { host: '127.0.0.1' },
        },
        'serve',
      ).then(({ server }) => server.host),
    ).resolves.toBe('127.0.0.1'))

  it.each(['0.0.0.0', true])(
    'rejects the wildcard CLI host override %s before the dev server starts',
    (host) =>
      expect(
        resolveConfig(
          {
            configFile: false,
            root,
            plugins: [createLoopbackHostGuard(undefined)],
            server: { host },
          },
          'serve',
        ),
      ).rejects.toThrow('Affect development server must resolve to a loopback host.'),
  )

  it('does not affect preview configuration', () =>
    expect(
      resolveConfig(
        {
          configFile: false,
          root,
          plugins: [createLoopbackHostGuard(undefined)],
          server: { host: '0.0.0.0' },
        },
        'serve',
        'production',
        'production',
        true,
      ).then(({ server }) => server.host),
    ).resolves.toBe('0.0.0.0'))

  it('does not affect production build configuration', () =>
    expect(
      resolveConfig(
        {
          configFile: false,
          root,
          plugins: [createLoopbackHostGuard(undefined)],
          server: { host: '0.0.0.0' },
        },
        'build',
        'production',
        'production',
      ).then(({ server }) => server.host),
    ).resolves.toBe('0.0.0.0'))

  it.each([
    { command: 'build' as const, isPreview: false },
    { command: 'serve' as const, isPreview: true },
  ])(
    'ignores invalid development-only env in $command preview=$isPreview',
    ({ command, isPreview }) => {
      expect(
        resolveServerOptions({
          command,
          isPreview,
          environment: {
            HOST: '0.0.0.0',
            PORT: 'invalid',
            PORTLESS_URL: 'https://example.invalid/path',
          },
        }),
      ).toStrictEqual({
        host: '127.0.0.1',
        port: 3000,
        portlessHost: undefined,
        portlessAuthority: undefined,
      })
    },
  )

  it('validates development ports', () => {
    expect(() =>
      resolveServerOptions({
        command: 'serve',
        isPreview: false,
        environment: {
          HOST: '127.0.0.1',
          PORT: 'invalid',
          PORTLESS_URL: undefined,
        },
      }),
    ).toThrow('PORT must be a valid TCP port.')
  })

  it('validates the Portless origin only for development', () => {
    expect(() =>
      resolveServerOptions({
        command: 'serve',
        isPreview: false,
        environment: {
          HOST: '127.0.0.1',
          PORT: undefined,
          PORTLESS_URL: 'https://example.invalid/path',
        },
      }),
    ).toThrow('PORTLESS_URL must be an origin on a localhost development hostname.')
  })

  it('captures the Portless authority, including its configured port', () => {
    expect(
      resolveServerOptions({
        command: 'serve',
        isPreview: false,
        environment: {
          HOST: '127.0.0.1',
          PORT: '4380',
          PORTLESS_URL: 'https://affect-tanstack.localhost:4443',
        },
      }),
    ).toStrictEqual({
      host: '127.0.0.1',
      port: 4380,
      portlessHost: 'affect-tanstack.localhost',
      portlessAuthority: 'affect-tanstack.localhost:4443',
    })
  })

  it('removes only the exact Portless Connection: close field before Nitro', () => {
    const request = {
      headers: {
        host: 'affect-tanstack.localhost:4443',
        connection: 'close',
        origin: 'https://affect-tanstack.localhost:4443',
      },
      rawHeaders: [
        'Host',
        'affect-tanstack.localhost:4443',
        'Connection',
        'close',
        'Origin',
        'https://affect-tanstack.localhost:4443',
      ],
      method: 'GET',
      socket: { localAddress: '127.0.0.1', localPort: 4380 },
    }

    expect(
      normalizePortlessConnection({
        request,
        portlessAuthority: 'affect-tanstack.localhost:4443',
        listenerAddress: {
          address: '127.0.0.1',
          family: 'IPv4',
          port: 4380,
        },
      }),
    ).toBeTruthy()
    expect(request.headers).toStrictEqual({
      host: 'affect-tanstack.localhost:4443',
      origin: 'https://affect-tanstack.localhost:4443',
    })
    expect(request.rawHeaders).toStrictEqual([
      'Host',
      'affect-tanstack.localhost:4443',
      'Origin',
      'https://affect-tanstack.localhost:4443',
    ])
  })

  it.each([
    {
      host: 'other.localhost:4443',
      authority: 'affect-tanstack.localhost:4443',
      address: '127.0.0.1',
    },
    {
      host: 'affect-tanstack.localhost',
      authority: 'affect-tanstack.localhost:4443',
      address: '127.0.0.1',
    },
    {
      host: 'affect-tanstack.localhost:4443',
      authority: 'affect-tanstack.localhost:4443',
      address: '0.0.0.0',
    },
  ])(
    'leaves unrelated host or non-loopback listener request headers intact',
    ({ host, authority, address }) => {
      const request = {
        headers: { host, connection: 'close' },
        rawHeaders: ['Host', host, 'Connection', 'close'],
        method: 'GET',
        socket: { localAddress: address, localPort: 4380 },
      }

      expect(
        normalizePortlessConnection({
          request,
          portlessAuthority: authority,
          listenerAddress: { address, family: 'IPv4', port: 4380 },
        }),
      ).toBeFalsy()
      expect(request.headers.connection).toBe('close')
      expect(request.rawHeaders).toStrictEqual(['Host', host, 'Connection', 'close'])
    },
  )

  it('leaves upgrades and multiple Connection fields intact', () => {
    const upgradeRequest = {
      headers: {
        host: 'affect-tanstack.localhost:4443',
        connection: 'close',
        upgrade: 'websocket',
      },
      rawHeaders: [
        'Host',
        'affect-tanstack.localhost:4443',
        'Connection',
        'close',
        'Upgrade',
        'websocket',
      ],
      method: 'GET',
      socket: { localAddress: '127.0.0.1', localPort: 4380 },
    }

    const duplicateRequest = {
      headers: { host: 'affect-tanstack.localhost:4443', connection: 'close, close' },
      rawHeaders: [
        'Host',
        'affect-tanstack.localhost:4443',
        'Connection',
        'close',
        'connection',
        'close',
      ],
      method: 'GET',
      socket: { localAddress: '127.0.0.1', localPort: 4380 },
    }

    const listener = { address: '127.0.0.1', family: 'IPv4', port: 4380 } as const

    expect(
      normalizePortlessConnection({
        request: upgradeRequest,
        portlessAuthority: 'affect-tanstack.localhost:4443',
        listenerAddress: listener,
      }),
    ).toBeFalsy()
    expect(
      normalizePortlessConnection({
        request: duplicateRequest,
        portlessAuthority: 'affect-tanstack.localhost:4443',
        listenerAddress: listener,
      }),
    ).toBeFalsy()
    expect(upgradeRequest.rawHeaders).toHaveLength(6)
    expect(duplicateRequest.rawHeaders).toHaveLength(6)
  })
})
