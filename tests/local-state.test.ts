import { describe, expect, it } from 'vitest'
import {
  localReply,
  isSupervisor,
  parseRun,
  portNumber,
  servicePorts,
} from '../scripts/local-state'

const id = '281d34fe-6075-4121-ac4e-686c7ef05807'
const script = '/checkout with spaces/scripts/local.ts'

describe('local runtime state', () => {
  it('accepts allocated TCP ports and rejects unavailable port numbers', () => {
    expect(portNumber(49_152)).toBe(49_152)

    for (const port of [0, -1, Number.NaN, 1.2, 65_536]) {
      expect(() => portNumber(port)).toThrow('Invalid loopback port.')
    }
  })

  it('assigns three separately reserved ports to the backend, site proxy and web app', () => {
    expect(servicePorts([51_001, 51_002, 51_003])).toStrictEqual({
      cloud: 51_001,
      site: 51_002,
      web: 51_003,
    })
    expect(() => servicePorts([51_001, 51_001, 51_003])).toThrow(
      'Expected three distinct local service ports.',
    )
  })

  it('round-trips a supervisor record and rejects incomplete writes', () => {
    expect(parseRun(`2048 ${id}`)).toStrictEqual({ pid: 2048, id })
    expect(() => parseRun('2048')).toThrow('Invalid local runtime record.')
  })

  it('treats another checkout or launch at the same PID as stale', () => {
    const command = `bun --no-env-file ${script} supervise ${id}\n`
    expect(isSupervisor({ command, script, id })).toBeTruthy()
    expect(isSupervisor({ command, script: '/other/scripts/local.ts', id })).toBeFalsy()
    expect(isSupervisor({ command, script, id: 'other' })).toBeFalsy()
  })
})

describe('supervisor replies', () => {
  it.each([
    ['/seed', { status: 'success', value: null }, 'Seeded demo@example.test.'],
    ['/count', { status: 'success', value: 0 }, '0'],
    [
      '/code',
      { status: 'success', value: { status: 'captured', email: { code: '012345' } } },
      '012345',
    ],
    ['/code', { status: 'error', value: '012345' }, null],
    ['/code', { status: 'success', value: { status: 'sent' } }, null],
    ['/count', { status: 'success', value: '0' }, null],
  ] as const)('validates %s response %o', (path, raw, expected) => {
    expect(localReply({ path, raw })).toBe(expected)
  })
})
