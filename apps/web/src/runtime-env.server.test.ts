import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { env as runtimeEnv } from 'node:process'
import { parse, set } from '@dotenvx/dotenvx'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { loadRuntimeEnvironment } from './runtime-env.server'

let directory: string
let source: string
let key: string
const secret = 'synthetic-runtime-only-marker'

describe('production runtime profile', () => {
  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'affect-runtime-env-'))
    const profilePath = path.join(directory, '.env')
    const envKeysFile = path.join(directory, '.env.keys')
    await set('AFFECT_RUNTIME_TEST_SECRET', secret, {
      path: profilePath,
      envKeysFile,
      noNative: true,
      noArmor: true,
    })
    source = await readFile(profilePath, 'utf-8')
    const keys = await readFile(envKeysFile, 'utf-8')
    key = parse(keys, { processEnv: {} })['DOTENV_PRIVATE_KEY'] ?? ''

    if (key === '') {
      throw new Error('Synthetic fixture key was not generated.')
    }
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    delete runtimeEnv['AFFECT_RUNTIME_TEST_SECRET']
  })

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('decrypts a profile using only its runtime key', () => {
    vi.stubEnv('DOTENV_PRIVATE_KEY', key)
    loadRuntimeEnvironment(source)
    expect(runtimeEnv['AFFECT_RUNTIME_TEST_SECRET']).toBe(secret)
  })

  it('decodes a binary Nitro server asset before decryption', () => {
    vi.stubEnv('DOTENV_PRIVATE_KEY', key)
    loadRuntimeEnvironment(new TextEncoder().encode(source))
    expect(runtimeEnv['AFFECT_RUNTIME_TEST_SECRET']).toBe(secret)
  })

  it.each([undefined, '', 'incorrect-private-key'])('fails safely with key %s', (value) => {
    vi.stubEnv('DOTENV_PRIVATE_KEY', value)
    expect(() => {
      loadRuntimeEnvironment(source)
    }).toThrow('Unable to initialize Affect runtime configuration.')
    expect(runtimeEnv['AFFECT_RUNTIME_TEST_SECRET']).toBeUndefined()
  })

  it.each([null, ''])('rejects missing profile %s before initialization', (value) => {
    vi.stubEnv('DOTENV_PRIVATE_KEY', key)
    expect(() => {
      loadRuntimeEnvironment(value)
    }).toThrow('Unable to initialize Affect runtime configuration.')
  })

  it('does not commit partially decrypted settings', () => {
    vi.stubEnv('DOTENV_PRIVATE_KEY', key)
    expect(() => {
      loadRuntimeEnvironment(`${source}\nBROKEN="encrypted:invalid"`)
    }).toThrow('Unable to initialize Affect runtime configuration.')
    expect(runtimeEnv['AFFECT_RUNTIME_TEST_SECRET']).toBeUndefined()
  })
})
