import { execFileSync, spawnSync } from 'node:child_process'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Array, Predicate, Record, Schema, String } from 'effect'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const repository = fileURLToPath(new URL('../', import.meta.url))

const bun = String.trim(
  execFileSync('bun', ['-e', 'process.stdout.write(process.execPath)'], { encoding: 'utf-8' }),
)

const require = createRequire(
  realpathSync(path.join(repository, 'node_modules/affect-cli/package.json')),
)

type DotenvKeyPair = { privateKey: string; publicKey: string }

// The installed SDK is untyped. Check its callable boundary and parse every returned value.
const primitiveModule = Schema.decodeUnknownSync(
  Schema.Struct({
    keypair: Schema.declare<() => DotenvKeyPair>((input): input is () => DotenvKeyPair =>
      Predicate.isFunction(input),
    ),
    encrypt: Schema.declare<(publicKey: string, value: string) => string>(
      (input): input is (publicKey: string, value: string) => string => Predicate.isFunction(input),
    ),
  }),
)(require('@dotenvx/primitives'))

const KeyPair = Schema.Struct({ privateKey: Schema.String, publicKey: Schema.String })

const primitives = {
  keypair: () => Schema.decodeSync(KeyPair)(primitiveModule.keypair()),
  encrypt: (publicKey: string, value: string) =>
    Schema.decodeSync(Schema.String)(primitiveModule.encrypt(publicKey, value)),
}

const decodeActivation = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      secret: Schema.NullOr(Schema.String),
      keyPresent: Schema.Boolean,
      selector: Schema.NullOr(Schema.String),
    }),
  ),
)

const syntheticSecret = 'synthetic-profile-secret-only-for-tests'

const profileValues = {
  CONVEX_DEPLOYMENT: 'dev:synthetic-backend',
  CONVEX_DEPLOY_KEY: 'dev:synthetic-backend|synthetic-deployment-secret',
  VITE_CONVEX_URL: 'https://synthetic-backend.convex.cloud',
  VITE_CONVEX_SITE_URL: 'https://synthetic-backend.convex.site',
  VITE_SITE_URL: '',
  SYNTHETIC_SECRET: syntheticSecret,
}

let fixture: string
let home: string
let key: string

const profilePath = (target = 'development') => path.join(fixture, 'env', target, '.env')

const keyPath = () => path.join(fixture, 'env/development/.env.keys')

const writeProfile = (overrides: Record<string, string> = {}, target = 'development') => {
  const pair = primitives.keypair()
  mkdirSync(path.dirname(profilePath(target)), { recursive: true })

  const assignments = Array.map(
    Record.toEntries({ ...profileValues, ...overrides }),
    ([name, value]) => `${name}="${primitives.encrypt(pair.publicKey, value)}"`,
  )

  writeFileSync(
    profilePath(target),
    Array.join([`DOTENV_PUBLIC_KEY="${pair.publicKey}"`, ...assignments, ''], '\n'),
  )

  return pair.privateKey
}

const environment = (extra: Record<string, string> = {}) =>
  // Deliberately do not inherit the runner's profile selectors or credentials.
  ({
    HOME: home,
    PATH: `${path.dirname(bun)}:/usr/bin:/bin`,
    AFFECT_TEST_BUN: bun,
    AFFECT_TEST_MISE_LOG: path.join(fixture, 'mise-calls'),
    ...extra,
  })

const setup = (extra: Record<string, string> = {}) =>
  spawnSync('/bin/bash', ['scripts/setup.sh'], {
    cwd: fixture,
    env: environment(extra),
    encoding: 'utf-8',
    timeout: 15_000,
  })

const activate = (extra: Record<string, string> = {}) =>
  spawnSync(
    '/bin/bash',
    [
      '--noprofile',
      '--norc',
      '-c',
      "source scripts/activate.sh && bun -e 'process.stdout.write(JSON.stringify({secret:process.env.SYNTHETIC_SECRET ?? null,keyPresent:!!process.env.DOTENV_PRIVATE_KEY,selector:process.env.VERCEL_ENV ?? null}))'",
    ],
    { cwd: fixture, env: environment(extra), encoding: 'utf-8', timeout: 15_000 },
  )

const expectSecretSafe = (result: ReturnType<typeof setup>, privateKey = key) => {
  const output = result.stdout + result.stderr
  expect(output).not.toContain(privateKey)
  expect(output).not.toContain(syntheticSecret)
  expect(output).not.toContain(profileValues.CONVEX_DEPLOY_KEY)
}

describe('local development setup', () => {
  beforeEach(() => {
    fixture = mkdtempSync(path.join(tmpdir(), 'affect-setup-test-'))
    home = path.join(fixture, 'home')
    cpSync(path.join(repository, 'scripts'), path.join(fixture, 'scripts'), { recursive: true })

    for (const file of ['mise.toml', 'package.json', 'bun.lock', '.gitignore']) {
      cpSync(path.join(repository, file), path.join(fixture, file))
    }

    symlinkSync(path.resolve(repository, 'node_modules'), path.join(fixture, 'node_modules'), 'dir')
    mkdirSync(path.join(home, '.local/bin'), { recursive: true })
    writeFileSync(
      path.join(home, '.local/bin/mise'),
      `#!/bin/bash
set -eu
[ "\${MISE_NO_ENV:-}" = 1 ] || exit 80
printf '%s\\n' "$*" >> "$AFFECT_TEST_MISE_LOG"
case "$*" in
  'trust mise.toml'|'install'|'exec -- bun install --frozen-lockfile') exit 0 ;;
  'exec -- bun scripts/validate-development-setup.ts')
    exec "$AFFECT_TEST_BUN" scripts/validate-development-setup.ts ;;
  *) printf '%s\\n' 'Unexpected setup tool invocation.' >&2; exit 81 ;;
esac
`,
      { mode: 0o755 },
    )
    key = writeProfile()
  })

  afterEach(() => {
    rmSync(fixture, { recursive: true, force: true })
  })

  it.each(['profile', 'key'])(
    'fails before tool installation when the %s is missing',
    (missing) => {
      if (missing === 'profile') {
        rmSync(profilePath())
      }

      const result = setup(missing === 'profile' ? { DOTENV_PRIVATE_KEY: key } : {})
      expect(result.status).toBe(1)
      expect(result.stderr).toContain(
        missing === 'profile' ? 'encrypted development profile' : 'DOTENV_PRIVATE_KEY',
      )
      expect(existsSync(path.join(fixture, 'mise-calls'))).toBeFalsy()
      expect(existsSync(keyPath())).toBeFalsy()
      expectSecretSafe(result)
    },
  )

  it('rejects an incorrect key without storing it or exposing secrets', () => {
    const wrongKey = primitives.keypair().privateKey
    const result = setup({ DOTENV_PRIVATE_KEY: wrongKey })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Unable to validate the encrypted development profile')
    expect(existsSync(keyPath())).toBeFalsy()
    expectSecretSafe(result)
    expectSecretSafe(result, wrongKey)
  })

  it.each([
    ['plaintext', 'encrypted assignments'],
    ['invalid origin', 'Unable to validate the encrypted development profile'],
    ['production deploy key', 'Unable to validate the encrypted development profile'],
  ])('rejects a profile containing %s', (problem, message) => {
    if (problem === 'plaintext') {
      writeFileSync(profilePath(), `VITE_CONVEX_URL=${syntheticSecret}\n`)
    } else {
      key = writeProfile(
        problem === 'invalid origin'
          ? { VITE_CONVEX_URL: 'https://synthetic-backend.convex.cloud/private' }
          : { CONVEX_DEPLOY_KEY: 'prod:synthetic-backend|synthetic-production-secret' },
      )
    }

    const result = setup({ DOTENV_PRIVATE_KEY: key })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(message)
    expect(existsSync(keyPath())).toBeFalsy()
    expectSecretSafe(result)
  })

  it('rejects conflicting inherited Convex credentials before saving a key', () => {
    const inherited = 'dev:other-synthetic-backend|other-synthetic-deployment-secret'
    const result = setup({ DOTENV_PRIVATE_KEY: key, CONVEX_DEPLOY_KEY: inherited })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Unable to validate the encrypted development profile')
    expect(existsSync(keyPath())).toBeFalsy()
    expectSecretSafe(result)
    expect(result.stdout + result.stderr).not.toContain(inherited)
  })

  it('validates development despite ambient CI and saves only its private key with narrow permissions', () => {
    const result = setup({ DOTENV_PRIVATE_KEY: key, CI: 'true', VERCEL_ENV: 'production' })
    expect({
      status: result.status,
      storedKey: readFileSync(keyPath(), 'utf-8'),
      keyMode: statSync(keyPath()).mode % 0o1000,
      directoryMode: statSync(path.dirname(keyPath())).mode % 0o1000,
      commands: String.split(
        String.trim(readFileSync(path.join(fixture, 'mise-calls'), 'utf-8')),
        '\n',
      ),
    }).toStrictEqual({
      status: 0,
      storedKey: `DOTENV_PRIVATE_KEY=${key}\n`,
      keyMode: 0o600,
      directoryMode: 0o700,
      commands: [
        'trust mise.toml',
        'install',
        'exec -- bun install --frozen-lockfile',
        'exec -- bun scripts/validate-development-setup.ts',
      ],
    })
    expectSecretSafe(result)

    const rerun = setup()
    expect(rerun.status).toBe(0)
    expect(readFileSync(keyPath(), 'utf-8')).toBe(`DOTENV_PRIVATE_KEY=${key}\n`)
    expectSecretSafe(rerun)

    const activation = activate()
    expect(activation.status).toBe(0)
    expect(decodeActivation(activation.stdout)).toStrictEqual({
      secret: syntheticSecret,
      keyPresent: true,
      selector: null,
    })
  })

  it.each([{ VERCEL_ENV: 'production' }, { CI: 'true' }, { GITHUB_ACTIONS: 'true' }])(
    'does not load the saved development key for selector %j',
    (selector) => {
      expect(setup({ DOTENV_PRIVATE_KEY: key }).status).toBe(0)
      const result = activate(selector)
      expect(result.status).toBe(0)
      expect(decodeActivation(result.stdout)).toStrictEqual({
        secret: null,
        keyPresent: false,
        selector: selector.VERCEL_ENV ?? null,
      })
      expectSecretSafe(result)
    },
  )

  it('honors an explicitly supplied process key over the saved development key', () => {
    expect(setup({ DOTENV_PRIVATE_KEY: key }).status).toBe(0)
    const saved = readFileSync(keyPath(), 'utf-8')
    const replacementKey = writeProfile({ SYNTHETIC_SECRET: 'replacement-synthetic-secret' })
    const result = activate({ DOTENV_PRIVATE_KEY: replacementKey })
    expect(result.status).toBe(0)
    expect(decodeActivation(result.stdout).secret).toBe('replacement-synthetic-secret')
    expect(readFileSync(keyPath(), 'utf-8')).toBe(saved)
    expect(result.stdout + result.stderr).not.toContain(replacementKey)
  })

  it.each(['profile', 'key', 'directory'])('refuses a symlinked development %s', (target) => {
    expect(setup({ DOTENV_PRIVATE_KEY: key }).status).toBe(0)

    const paths: Record<string, string> = {
      directory: path.dirname(keyPath()),
      profile: profilePath(),
      key: keyPath(),
    }

    const selectedPath = paths[target]

    if (selectedPath === undefined) {
      throw new Error('Unknown fixture symlink target.')
    }

    const outside = path.join(fixture, `original-${target}`)
    renameSync(selectedPath, outside)
    symlinkSync(outside, selectedPath, target === 'directory' ? 'dir' : 'file')
    const result = setup({ DOTENV_PRIVATE_KEY: key })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('regular local profile')
    expectSecretSafe(result)
  })

  it('refuses an insecure stored key when starting a fresh shell', () => {
    expect(setup({ DOTENV_PRIVATE_KEY: key }).status).toBe(0)
    chmodSync(keyPath(), 0o644)
    const result = activate()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('must be private')
    expectSecretSafe(result)
  })
})
