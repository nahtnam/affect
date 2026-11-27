import { Schema, Option } from 'effect'

export const portNumber = (port: number) => {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('Invalid loopback port.')
  }

  return port
}

export const servicePorts = (ports: readonly number[]) => {
  const [cloud, site, web] = ports

  if (
    cloud === undefined ||
    site === undefined ||
    web === undefined ||
    new Set(ports).size !== 3 ||
    ports.length !== 3
  ) {
    throw new Error('Expected three distinct local service ports.')
  }

  return { cloud: portNumber(cloud), site: portNumber(site), web: portNumber(web) }
}

export const parseRun = (record: string) => {
  const match = /^(?<pid>\d+) (?<id>[a-f\d-]{36})$/u.exec(record)

  if (
    match?.groups?.['pid'] === undefined ||
    match.groups['id'] === undefined ||
    Number(match.groups['pid']) < 2 ||
    !Number.isSafeInteger(Number(match.groups['pid']))
  ) {
    throw new Error('Invalid local runtime record.')
  }

  return { pid: Number(match.groups['pid']), id: match.groups['id'] }
}

export const isSupervisor = ({
  command,
  script,
  id,
}: {
  command: string
  script: string
  id: string
}) => command.trimEnd().endsWith(` ${script} supervise ${id}`)

const decodedReply = Schema.decodeUnknownOption(
  Schema.Struct({
    status: Schema.Literal('success'),
    value: Schema.Union([
      Schema.Null,
      Schema.Int,
      Schema.Struct({
        status: Schema.Literal('captured'),
        email: Schema.Struct({ code: Schema.String.check(Schema.isPattern(/^\d{6}$/u)) }),
      }),
    ]),
  }),
)

export const localReply = ({
  path,
  raw,
}: {
  path: string
  raw: Parameters<typeof decodedReply>[0]
}) => {
  const result = decodedReply(raw)

  if (Option.isNone(result)) {
    return null
  }

  const { value } = result.value

  switch (path) {
    case '/seed': {
      return value === null ? 'Seeded demo@example.test.' : null
    }

    case '/count': {
      return Schema.is(Schema.Int)(value) && value >= 0 ? String(value) : null
    }

    case '/code': {
      return value !== null && !Schema.is(Schema.Int)(value) ? value.email.code : null
    }

    default: {
      return null
    }
  }
}
