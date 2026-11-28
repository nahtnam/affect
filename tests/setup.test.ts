import { execFileSync, spawnSync } from 'node:child_process'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
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

const require = createRequire(import.meta.url)

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

const toolchainPaths = () => path.join(fixture, '.setup.local/toolchain.paths')

const nativeDirectoryVariables = [
  'MISE_CONFIG_DIR',
  'MISE_DATA_DIR',
  'MISE_CACHE_DIR',
  'MISE_STATE_DIR',
  'MISE_TMP_DIR',
  'MISE_INSTALLS_DIR',
  'MISE_INSTALL_STORE_DIR',
  'MISE_PLUGINS_DIR',
  'MISE_DOWNLOADS_DIR',
  'MISE_SHIMS_DIR',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_CACHE_HOME',
  'XDG_STATE_HOME',
  'BUN_INSTALL',
  'BUN_INSTALL_CACHE_DIR',
  'BUN_INSTALL_GLOBAL_DIR',
  'BUN_INSTALL_BIN',
  'BUN_RUNTIME_TRANSPILER_CACHE_PATH',
  'BUN_TMPDIR',
  'TMPDIR',
  'PORTLESS_STATE_DIR',
]

const decodeToolchain = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.NullOr(Schema.String))),
)

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

const setup = (extra: Record<string, string> = {}, arguments_: string[] = []) =>
  spawnSync('/bin/bash', ['scripts/setup.sh', ...arguments_], {
    cwd: fixture,
    env: environment(extra),
    encoding: 'utf-8',
    timeout: 15_000,
  })

// A stub isolates persistence and credential boundaries. Native read-only-HOME
// portability requires the separate Linux execution proof, not these fixtures.
const inspectToolchain = (extra: Record<string, string> = {}, arguments_: string[] = []) =>
  spawnSync(
    '/bin/bash',
    ['scripts/mise.sh', 'exec', '--', 'bun', 'inspect-toolchain.ts', ...arguments_],
    {
      cwd: fixture,
      env: environment(extra),
      encoding: 'utf-8',
      timeout: 15_000,
    },
  )

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

const prepareHostedFixture = () => {
  cpSync(profilePath(), path.join(fixture, 'hosted.env'))
  writeFileSync(path.join(fixture, 'hosted.keys'), `DOTENV_PRIVATE_KEY=${key}\n`, {
    mode: 0o600,
  })
  rmSync(path.join(fixture, 'env'), { recursive: true })
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
      path.join(fixture, 'inspect-toolchain.ts'),
      `const names = ${Schema.encodeSync(Schema.fromJsonString(Schema.Array(Schema.String)))(['HOME', 'MISE_INSTALL_PATH', ...nativeDirectoryVariables, 'VERCEL_ENV', 'CI'])};
process.stdout.write(JSON.stringify({
  ...Object.fromEntries(names.map(name => [name, process.env[name] ?? null])),
  keyPresent: process.env.DOTENV_PRIVATE_KEY ? 'yes' : 'no',
  secretPresent: process.env.SYNTHETIC_SECRET ? 'yes' : 'no',
  arguments: process.argv.slice(2).join('\\n'),
}));\n`,
    )
    writeFileSync(
      path.join(fixture, 'hosted-init.ts'),
      `import { chmodSync, copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
writeFileSync('hosted-control.calls', (process.env.AFFECT_REQUIRE_DEVELOPMENT ?? 'absent') + String.fromCharCode(10), { flag: 'a' });
if (args.length === 1 && args[0] === '--help') {
  process.stdout.write(process.env.AFFECT_TEST_OLD_CLI === '1' ? 'Usage: affect env <subcommand>' : 'Usage: affect env init [flags]');
} else if (process.env.AFFECT_REQUIRE_DEVELOPMENT !== '1') {
  process.stderr.write('Synthetic hosted setup requires its development control.');
  process.exitCode = 1;
} else if (args.includes('--profiles') && !args[args.indexOf('--profiles') + 1]?.split(',').includes('development')) {
  process.stderr.write('Hosted setup requires the development profile.');
  process.exitCode = 1;
} else if (process.env.AFFECT_TEST_INIT_FAIL === '1') {
  process.stderr.write('Synthetic hosted init failure.');
  process.exitCode = 1;
} else {
  writeFileSync('hosted-init.args', JSON.stringify(args));
  mkdirSync('env/development', { recursive: true, mode: 0o700 });
  copyFileSync('hosted.env', 'env/development/.env');
  copyFileSync('hosted.keys', 'env/development/.env.keys');
  chmodSync('env/development/.env.keys', 0o600);
}
`,
    )
    writeFileSync(
      path.join(home, '.local/bin/mise'),
      `#!/bin/bash
set -eu
printf '%s\\n' "$*" >> "$AFFECT_TEST_MISE_LOG"
case "$*" in
  'exec -- bunx --no-install affect env init'*) ;;
  *) [ -z "\${AFFECT_REQUIRE_DEVELOPMENT:-}" ] || exit 82 ;;
esac
case "$*" in
  'trust mise.toml'|'install'|'exec -- bun install --frozen-lockfile')
    [ "\${MISE_NO_ENV:-}" = 1 ] || exit 80
    exit 0 ;;
  'exec -- bun scripts/validate-development-setup.ts')
    [ "\${MISE_NO_ENV:-}" = 1 ] || exit 80
    exec "$AFFECT_TEST_BUN" scripts/validate-development-setup.ts ;;
  'exec -- bunx --no-install affect env init'*)
    [ "\${MISE_NO_ENV:-}" = 1 ] || exit 80
    shift 7
    exec "$AFFECT_TEST_BUN" hosted-init.ts "$@" ;;
  'exec -- bun inspect-toolchain.ts'*)
    shift 3
    exec "$AFFECT_TEST_BUN" "$@" ;;
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

  it('initializes hosted profiles after installing tools without an existing profile or process key', () => {
    prepareHostedFixture()

    const arguments_ = [
      '--team',
      '11',
      '--project',
      '22',
      '--profiles',
      'development,preview',
      '--site-url',
      'https://synthetic-app.invalid',
      '--values',
      'private settings.json',
      '--non-interactive',
    ]

    const result = setup({}, ['--hosted', ...arguments_])
    expect(result.status).toBe(0)
    expect(
      Schema.decodeSync(Schema.fromJsonString(Schema.Array(Schema.String)))(
        readFileSync(path.join(fixture, 'hosted-init.args'), 'utf-8'),
      ),
    ).toStrictEqual(arguments_)
    expect(readFileSync(path.join(fixture, 'mise-calls'), 'utf-8')).toBe(
      `trust mise.toml\ninstall\nexec -- bun install --frozen-lockfile\nexec -- bunx --no-install affect env init --help\nexec -- bunx --no-install affect env init ${Array.join(arguments_, ' ')}\nexec -- bun scripts/validate-development-setup.ts\n`,
    )
    expect({
      key: readFileSync(keyPath(), 'utf-8'),
      mode: statSync(keyPath()).mode % 0o1000,
      paths: existsSync(toolchainPaths()),
      controls: readFileSync(path.join(fixture, 'hosted-control.calls'), 'utf-8'),
      persistedControl: String.includes('AFFECT_REQUIRE_DEVELOPMENT')(
        readFileSync(profilePath(), 'utf-8') + readFileSync(toolchainPaths(), 'utf-8'),
      ),
    }).toStrictEqual({
      key: `DOTENV_PRIVATE_KEY=${key}\n`,
      mode: 0o600,
      paths: true,
      controls: 'absent\n1\n',
      persistedControl: false,
    })
    expectSecretSafe(result)
  })

  it('preserves literal hosted arguments without shell evaluation', () => {
    prepareHostedFixture()
    const literal = 'literal$(touch should-not-exist)'
    const result = setup({}, ['--hosted', '--create-project', literal])
    expect(result.status).toBe(0)
    expect(readFileSync(path.join(fixture, 'hosted-init.args'), 'utf-8')).toBe(
      Schema.encodeSync(Schema.fromJsonString(Schema.Array(Schema.String)))([
        '--create-project',
        literal,
      ]),
    )
    expect(existsSync(path.join(fixture, 'should-not-exist'))).toBeFalsy()
    expectSecretSafe(result)
  })

  it('validates the restored development key instead of an unrelated ambient key', () => {
    prepareHostedFixture()
    const unrelatedKey = primitives.keypair().privateKey
    const result = setup({ DOTENV_PRIVATE_KEY: unrelatedKey }, ['--hosted', '--team', '11'])
    expect(result.status).toBe(0)
    expect(readFileSync(keyPath(), 'utf-8')).toBe(`DOTENV_PRIVATE_KEY=${key}\n`)
    expectSecretSafe(result)
    expectSecretSafe(result, unrelatedKey)
  })

  it('rejects parent help from an unsupported CLI before hosted initialization', () => {
    prepareHostedFixture()
    const result = setup({ AFFECT_TEST_OLD_CLI: '1' }, ['--hosted', '--team', '11'])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('released compatible Affect CLI')
    expect({
      initialized: existsSync(path.join(fixture, 'hosted-init.args')),
      profile: existsSync(profilePath()),
      paths: existsSync(toolchainPaths()),
    }).toStrictEqual({ initialized: false, profile: false, paths: false })
    expectSecretSafe(result)
  })

  it('stops before local validation or saved paths when hosted initialization fails', () => {
    prepareHostedFixture()
    const result = setup({ AFFECT_TEST_INIT_FAIL: '1' }, ['--hosted', '--team', '11'])
    expect(result.status).toBe(1)
    expect(readFileSync(path.join(fixture, 'mise-calls'), 'utf-8')).not.toContain(
      'validate-development-setup.ts',
    )
    expect(existsSync(toolchainPaths())).toBeFalsy()
    expectSecretSafe(result)
  })

  it('stops hosted setup without development before profile creation or local validation', () => {
    prepareHostedFixture()
    const result = setup({}, ['--hosted', '--profiles', 'preview,production'])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('requires the development profile')
    expect(readFileSync(path.join(fixture, 'mise-calls'), 'utf-8')).not.toContain(
      'validate-development-setup.ts',
    )
    expect({
      initialized: existsSync(path.join(fixture, 'hosted-init.args')),
      profile: existsSync(profilePath()),
      paths: existsSync(toolchainPaths()),
    }).toStrictEqual({ initialized: false, profile: false, paths: false })
    expectSecretSafe(result)
  })

  it.each([['--team', '11'], ['unexpected'], ['', '--hosted']])(
    'rejects setup arguments without explicit hosted intent: %j',
    (...arguments_) => {
      const result = setup({}, arguments_)
      expect(result.status).toBe(1)
      expect(result.stderr).toContain('Unexpected setup arguments')
      expect(existsSync(path.join(fixture, 'mise-calls'))).toBeFalsy()
      expectSecretSafe(result)
    },
  )

  it('shows setup help without installing tools or requiring a profile', () => {
    prepareHostedFixture()
    const result = setup({}, ['--help'])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('--hosted <affect env init flags...>')
    expect(existsSync(path.join(fixture, 'mise-calls'))).toBeFalsy()
    expectSecretSafe(result)
  })

  it('passes hosted help through without requiring local validation', () => {
    prepareHostedFixture()
    const result = setup({}, ['--hosted', '--help'])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Usage: affect env init [flags]')
    expect(readFileSync(path.join(fixture, 'mise-calls'), 'utf-8')).not.toContain(
      'validate-development-setup.ts',
    )
    expect(existsSync(profilePath())).toBeFalsy()
    expectSecretSafe(result)
  })

  it('requires the encrypted development profile when a key is supplied', () => {
    rmSync(profilePath())
    const result = setup({ DOTENV_PRIVATE_KEY: key })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('encrypted development profile')
  })

  it.each([
    ['absent', 'Using local anonymous'],
    ['present', 'Using development profile'],
    ['wrong', 'check the file and its DOTENV_PRIVATE_KEY'],
  ])('selects dev mode with a %s key', (kind, expected) => {
    // Stop at the selected executable; neither branch starts a service in this fixture.
    const bin = path.join(home, '.local/bin')

    for (const executable of ['node', 'portless']) {
      writeFileSync(path.join(bin, executable), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
    }

    const result = spawnSync('/bin/bash', ['scripts/dev.sh'], {
      cwd: fixture,
      encoding: 'utf-8',
      env: {
        ...environment(
          kind === 'absent'
            ? {}
            : { DOTENV_PRIVATE_KEY: kind === 'present' ? key : primitives.keypair().privateKey },
        ),
        PATH: `${bin}:${environment().PATH}`,
      },
    })

    expect(result.status).toBe(kind === 'wrong' ? 1 : 0)
    expect(result.stdout + result.stderr).toContain(expected)
    expectSecretSafe(result)
  })

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

  it('restores explicit native paths in a fresh wrapper without retaining setup credentials or selectors', () => {
    const explicit: Record<string, string> = {}

    for (const name of nativeDirectoryVariables) {
      const directory = path.join(fixture, 'native paths', String.toLowerCase(name))
      mkdirSync(directory, { recursive: true })
      explicit[name] = directory
    }

    const executable = path.join(fixture, 'native paths', 'bin', 'mise')
    mkdirSync(path.dirname(executable), { recursive: true })
    cpSync(path.join(home, '.local/bin/mise'), executable)
    explicit['MISE_INSTALL_PATH'] = executable

    const result = setup({
      ...explicit,
      DOTENV_PRIVATE_KEY: key,
      VERCEL_ENV: 'production',
      CI: 'true',
      HTTPS_PROXY: 'https://synthetic-proxy-credential.invalid',
    })

    expect(result.status).toBe(0)

    const saved = readFileSync(toolchainPaths(), 'utf-8')
    expect({
      leaked: Array.filter(
        [key, syntheticSecret, 'VERCEL_ENV', 'CI=', 'HTTPS_PROXY', 'synthetic-proxy-credential'],
        (value) => String.includes(value)(saved),
      ),
      fileMode: statSync(toolchainPaths()).mode % 0o1000,
      directoryMode: statSync(path.dirname(toolchainPaths())).mode % 0o1000,
    }).toStrictEqual({ leaked: [], fileMode: 0o600, directoryMode: 0o700 })

    const fresh = inspectToolchain()
    expect(fresh.status).toBe(0)
    const observed = decodeToolchain(fresh.stdout)
    expect(observed).toMatchObject({
      ...explicit,
      HOME: home,
      VERCEL_ENV: null,
      CI: null,
      keyPresent: 'no',
      secretPresent: 'no',
    })
    expectSecretSafe(result)
    expectSecretSafe(fresh)

    const repeat = setup()
    expect({ status: repeat.status, saved: readFileSync(toolchainPaths(), 'utf-8') }).toStrictEqual(
      {
        status: 0,
        saved,
      },
    )
    expectSecretSafe(repeat)
  })

  it('passes current profile selectors through the wrapper without loading a saved development key itself', () => {
    expect(setup({ DOTENV_PRIVATE_KEY: key }).status).toBe(0)

    const result = inspectToolchain({ VERCEL_ENV: 'production', CI: 'true' }, [
      'one argument',
      '--native-flag',
      'literal$()',
    ])

    expect(result.status).toBe(0)
    expect(decodeToolchain(result.stdout)).toMatchObject({
      HOME: home,
      VERCEL_ENV: 'production',
      CI: 'true',
      keyPresent: 'no',
      secretPresent: 'no',
      arguments: 'one argument\n--native-flag\nliteral$()',
    })
    expectSecretSafe(result)
  })

  it.each(['', '0'])('preserves an explicit disabled Bun transpiler cache value %j', (value) => {
    expect(
      setup({ DOTENV_PRIVATE_KEY: key, BUN_RUNTIME_TRANSPILER_CACHE_PATH: value }).status,
    ).toBe(0)
    const fresh = inspectToolchain()
    expect(fresh.status).toBe(0)
    expect(decodeToolchain(fresh.stdout)['BUN_RUNTIME_TRANSPILER_CACHE_PATH']).toBe(value)
    expect(setup().status).toBe(0)
    expect(decodeToolchain(inspectToolchain().stdout)['BUN_RUNTIME_TRANSPILER_CACHE_PATH']).toBe(
      value,
    )
  })

  it.each(['MISE_CACHE_DIR', 'XDG_STATE_HOME', 'BUN_INSTALL', 'BUN_TMPDIR', 'PORTLESS_STATE_DIR'])(
    'rejects a relative explicit %s before invoking tools',
    (name) => {
      const result = setup({ DOTENV_PRIVATE_KEY: key, [name]: 'relative-native-directory' })
      expect(result.status).toBe(1)
      expect(result.stderr).toContain(name)
      expect(existsSync(path.join(fixture, 'mise-calls'))).toBeFalsy()
      expect(existsSync(toolchainPaths())).toBeFalsy()
      expectSecretSafe(result)
    },
  )

  it('rejects an explicit directory blocked by a regular file before invoking tools', () => {
    // This fails for privileged runners too; chmod alone would not prove denial.
    const blocked = path.join(fixture, 'blocked-cache')
    writeFileSync(blocked, 'regular-file')
    const result = setup({ DOTENV_PRIVATE_KEY: key, MISE_CACHE_DIR: blocked })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('MISE_CACHE_DIR')
    expect(existsSync(path.join(fixture, 'mise-calls'))).toBeFalsy()
    expect(existsSync(toolchainPaths())).toBeFalsy()
    expect(readFileSync(blocked, 'utf-8')).toBe('regular-file')
    expectSecretSafe(result)
  })

  it('rejects conflicting fresh-wrapper paths until setup explicitly selects them', () => {
    expect(setup({ DOTENV_PRIVATE_KEY: key }).status).toBe(0)
    const saved = readFileSync(toolchainPaths(), 'utf-8')
    const different = path.join(fixture, 'different-cache')
    mkdirSync(different)
    const result = inspectToolchain({ MISE_CACHE_DIR: different })
    expect(result.status).toBe(1)
    expect(readFileSync(toolchainPaths(), 'utf-8')).toBe(saved)
    expectSecretSafe(result)
    expect(setup({ MISE_CACHE_DIR: different }).status).toBe(0)
    expect(decodeToolchain(inspectToolchain().stdout)['MISE_CACHE_DIR']).toBe(different)
  })

  it.each(['malformed', 'duplicate', 'unknown', 'compound key'])(
    'refuses a %s saved path record without executing its contents',
    (problem) => {
      expect(setup({ DOTENV_PRIVATE_KEY: key }).status).toBe(0)
      const saved = readFileSync(toolchainPaths(), 'utf-8')
      const marker = path.join(fixture, 'path-config-executed')

      const records: Record<string, string> = {
        malformed: `touch ${marker}`,
        duplicate: `MISE_CACHE_DIR=${path.join(fixture, 'second-cache')}`,
        unknown: `UNKNOWN_PATH=$(touch ${marker})`,
        'compound key': `MISE_DATA_DIR MISE_CACHE_DIR=${path.join(fixture, 'compound')}`,
      }

      const record = records[problem]
      writeFileSync(toolchainPaths(), `${saved}${record}\n`, { mode: 0o600 })

      const result = inspectToolchain()
      expect(result.status).toBe(1)
      expect(existsSync(marker)).toBeFalsy()
      expectSecretSafe(result)

      const rerun = setup()
      expect(rerun.status).toBe(1)
      expect(existsSync(marker)).toBeFalsy()
      expectSecretSafe(rerun)
    },
  )

  it.each(['file', 'directory'])('refuses a symlinked saved path %s', (target) => {
    expect(setup({ DOTENV_PRIVATE_KEY: key }).status).toBe(0)
    const selected = target === 'file' ? toolchainPaths() : path.dirname(toolchainPaths())
    const outside = path.join(fixture, `original-path-${target}`)
    renameSync(selected, outside)
    symlinkSync(outside, selected, target === 'file' ? 'file' : 'dir')
    const result = inspectToolchain()
    expect(result.status).toBe(1)
    expectSecretSafe(result)
    expect(setup().status).toBe(1)
  })

  it.each(['file', 'directory'])(
    'refuses saved path %s permissions that expose state',
    (target) => {
      expect(setup({ DOTENV_PRIVATE_KEY: key }).status).toBe(0)
      chmodSync(
        target === 'file' ? toolchainPaths() : path.dirname(toolchainPaths()),
        target === 'file' ? 0o644 : 0o755,
      )
      const result = inspectToolchain()
      expect(result.status).toBe(1)
      expectSecretSafe(result)
      expect(setup().status).toBe(1)
    },
  )
})
