import type { AddressInfo } from 'node:net'
import type { Plugin } from 'vite'
import * as EffectString from 'effect/String'

const isLoopbackAddress = (address: string) => address === '127.0.0.1' || address === '::1'

type PortlessRequest = {
  headers: {
    host?: string | undefined
    connection?: string | undefined
    upgrade?: string | undefined
  }
  rawHeaders: string[]
  method?: string | undefined
  socket: { localAddress?: string | undefined; localPort?: number | undefined }
}

const findSingleCloseField = (rawHeaders: string[]) => {
  const fields: number[] = []

  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (EffectString.toLowerCase(rawHeaders[index] ?? '') === 'connection') {
      fields.push(index)
    }
  }

  const [index] = fields

  return fields.length === 1 &&
    index !== undefined &&
    EffectString.toLowerCase(EffectString.trim(rawHeaders[index + 1] ?? '')) === 'close'
    ? index
    : undefined
}

export const normalizePortlessConnection = (input: {
  request: PortlessRequest
  portlessAuthority: string
  listenerAddress: AddressInfo | string | null
}) => {
  const { request: req, portlessAuthority, listenerAddress } = input
  const connectionIndex = findSingleCloseField(req.rawHeaders)

  // Node's address() is a TCP address for this configured port listener, but its API also allows Unix sockets.
  const listener = listenerAddress instanceof Object ? listenerAddress : null

  if (
    req.headers.upgrade === undefined &&
    req.method !== 'UPGRADE' &&
    req.headers.host === portlessAuthority &&
    listener !== null &&
    listener.port === req.socket.localPort &&
    isLoopbackAddress(listener.address) &&
    isLoopbackAddress(req.socket.localAddress ?? '') &&
    EffectString.toLowerCase(EffectString.trim(req.headers.connection ?? '')) === 'close' &&
    connectionIndex !== undefined
  ) {
    delete req.headers.connection

    req.rawHeaders.splice(connectionIndex, 2)

    return true
  }

  return false
}

export const createLoopbackHostGuard = (portlessAuthority: string | undefined): Plugin => ({
  name: 'affect-loopback-host-guard',
  enforce: 'pre',
  apply: (_config, { command, isPreview }) => command === 'serve' && isPreview !== true,
  configResolved(config) {
    if (
      config.server.host !== '127.0.0.1' &&
      config.server.host !== '::1' &&
      config.server.host !== 'localhost'
    ) {
      throw new Error('Affect development server must resolve to a loopback host.')
    }
  },
  configureServer(server) {
    if (portlessAuthority === undefined) {
      return
    }

    server.middlewares.use((req, _res, next) => {
      normalizePortlessConnection({
        request: req,
        portlessAuthority,
        listenerAddress: server.httpServer?.address() ?? null,
      })
      next()
    })
  },
})
