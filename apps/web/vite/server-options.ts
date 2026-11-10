import * as EffectString from 'effect/String'

type ViteCommand = 'build' | 'serve'

type Environment = {
  HOST?: string | undefined
  PORT?: string | undefined
  PORTLESS_URL?: string | undefined
}

type ServerOptions = {
  host: string
  port: number
  portlessHost: string | undefined
  portlessAuthority: string | undefined
}

const parsePortlessOrigin = (value: string | undefined) => {
  if (value === undefined || value.length === 0) {
    return { host: undefined, authority: undefined }
  }

  const origin = new URL(value)
  const host = origin.hostname
  const isLocalHost = host === 'localhost' || EffectString.endsWith('.localhost')(host)

  if (
    (origin.protocol !== 'http:' && origin.protocol !== 'https:') ||
    origin.username.length > 0 ||
    origin.password.length > 0 ||
    origin.pathname !== '/' ||
    origin.search.length > 0 ||
    origin.hash.length > 0 ||
    !isLocalHost
  ) {
    throw new Error('PORTLESS_URL must be an origin on a localhost development hostname.')
  }

  return { host, authority: origin.host }
}

const parsePort = (value: string | undefined) => {
  const port = value === undefined || value.length === 0 ? 3000 : Number(value)

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be a valid TCP port.')
  }

  return port
}

export const resolveServerOptions = (input: {
  command: ViteCommand
  isPreview: boolean | undefined
  environment: Environment
}): ServerOptions => {
  const { command, isPreview, environment } = input

  if (command !== 'serve' || isPreview === true) {
    return {
      host: '127.0.0.1',
      port: 3000,
      portlessHost: undefined,
      portlessAuthority: undefined,
    }
  }

  const portless = parsePortlessOrigin(environment.PORTLESS_URL)

  return {
    host: environment.HOST ?? '127.0.0.1',
    port: parsePort(environment.PORT),
    portlessHost: portless.host,
    portlessAuthority: portless.authority,
  }
}
