// Native IO stays local; unknown profile values are validated before key persistence.
import { Predicate, Schema, String as EffectString } from 'effect'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const root = path.dirname(import.meta.dirname)
const directory = path.join(root, 'env', 'development')
const profile = path.join(directory, '.env')
const keyFile = path.join(directory, '.env.keys')
const privateKey = Schema.String.check(Schema.isPattern(/^[a-fA-F0-9]{64}$/u))
const publicKey = Schema.String.check(Schema.isPattern(/^[a-fA-F0-9]{66}$/u))
const ciphertext = Schema.String.check(Schema.isPattern(/^encrypted:[A-Za-z0-9+/=_-]+$/u))

const httpOrigin = Schema.String.check(
  Schema.makeFilter((value) => {
    if (!URL.canParse(value)) {
      return false
    }

    const url = new URL(value)

    return (
      /^https?:$/u.test(url.protocol) &&
      url.username === '' &&
      url.password === '' &&
      (value === url.origin || value === `${url.origin}/`)
    )
  }),
)

const developmentValues = Schema.Struct({
  VITE_CONVEX_URL: httpOrigin,
  VITE_CONVEX_SITE_URL: httpOrigin,
  VITE_SITE_URL: Schema.optionalKey(Schema.Union([Schema.Literal(''), httpOrigin])),
  CONVEX_DEPLOY_KEY: Schema.optionalKey(
    Schema.String.check(Schema.isPattern(/^(?:|dev:[a-z0-9-]+\|[^\s]+)$/u)),
  ),
})

const dotenvxApi = Schema.Struct({
  getSync: Schema.declare<(...args: unknown[]) => Record<string, string>>(
    (value): value is (...args: unknown[]) => Record<string, string> => Predicate.isFunction(value),
  ),
})

class SetupFailure extends Schema.TaggedError<SetupFailure, { readonly brand: unique symbol }>()(
  'SetupFailure',
  {
    message: Schema.String,
  },
) {}

const fail: (message: string) => never = (message) => {
  throw SetupFailure.make({ message })
}

const safeDirectory = (file: string) => {
  const stat = lstatSync(file)

  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    fail('Development setup requires regular local profile directories.')
  }
}

const safeFile = (file: string) => {
  const stat = lstatSync(file)

  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    fail('Development setup requires regular local profile and key files.')
  }

  return stat
}

const pathExists = (file: string) => {
  try {
    lstatSync(file)

    return true
  } catch (error) {
    if (Predicate.isError(error) && 'code' in error && error.code === 'ENOENT') {
      return false
    }

    throw error
  }
}

const readKey = () => {
  safeDirectory(path.join(root, 'env'))
  safeDirectory(directory)

  const stat = safeFile(keyFile)

  if (stat.mode % 4096 !== 0o600 || stat.uid !== process.getuid?.()) {
    fail('The development key file must be private and owned by the current user.')
  }

  const match = /^DOTENV_PRIVATE_KEY=(?<key>[a-fA-F0-9]{64})\n?$/u.exec(
    readFileSync(keyFile, 'utf-8'),
  )

  const key = match?.groups?.['key']

  if (key === undefined) {
    return fail('The stored development key file is invalid.')
  }

  return key
}

const validateCiphertext = (source: string) => {
  const names = new Set<string>()

  for (const raw of EffectString.split(/\r?\n/u)(source)) {
    const line = EffectString.trim(raw)

    if (line === '' || EffectString.startsWith('#')(line)) {
      continue
    }

    const match =
      /^(?:export\s+)?(?<name>[A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:"(?<double>[^"\r\n]*)"|'(?<single>[^'\r\n]*)'|(?<bare>[^\s#]+))\s*(?:#.*)?$/u.exec(
        line,
      )

    const name = match?.groups?.['name']

    if (name === undefined || names.has(name)) {
      fail(
        'The development profile must contain only encrypted assignments and public-key metadata.',
      )
    }

    const value = match?.groups?.['double'] ?? match?.groups?.['single'] ?? match?.groups?.['bare']

    names.add(name)

    if (EffectString.startsWith('DOTENV_PRIVATE_KEY')(name)) {
      fail('The development profile must not contain private-key assignments.')
    }

    if (name === 'DOTENV_PUBLIC_KEY') {
      if (!Schema.is(publicKey)(value)) {
        fail('The development profile public-key metadata is invalid.')
      }
    } else if (!Schema.is(ciphertext)(value)) {
      fail(
        'The development profile must contain only encrypted assignments and public-key metadata.',
      )
    }
  }
}

const validateNativeValues = (): void => {
  // Resolve the API through the pinned CLI dependency, including Bun's layout.
  const require = createRequire(import.meta.resolve('affect-cli/package.json'))
  const api: unknown = require('@dotenvx/dotenvx')

  if (!Schema.is(dotenvxApi)(api)) {
    fail('Unable to load the pinned development profile validator.')
  }

  const values: unknown = api.getSync(undefined, {
    path: profile,
    overload: true,
    strict: true,
    noArmor: true,
    noNative: true,
    no1Password: true,
    noBitwarden: true,
  })

  if (!Schema.is(developmentValues)(values)) {
    fail('The development profile has invalid public origins or deploy-key scope.')
  }

  const inherited = process.env['CONVEX_DEPLOY_KEY']

  if (inherited !== undefined && inherited !== '' && inherited !== values.CONVEX_DEPLOY_KEY) {
    fail('CONVEX_DEPLOY_KEY conflicts with the encrypted development profile.')
  }
}

const setup = () => {
  safeDirectory(path.join(root, 'env'))
  safeDirectory(directory)
  safeFile(profile)

  // Inspect an existing destination even when a process key will replace it.
  if (pathExists(keyFile)) {
    safeFile(keyFile)
  }

  const supplied = process.env['DOTENV_PRIVATE_KEY']
  const key = supplied === undefined || supplied === '' ? readKey() : supplied

  if (!Schema.is(privateKey)(key)) {
    fail('Provide a valid development DOTENV_PRIVATE_KEY.')
  }

  validateCiphertext(readFileSync(profile, 'utf-8'))

  // Native dotenvx can emit secret-bearing diagnostics, including on failure.
  const validation = spawnSync(process.execPath, [import.meta.filename, '--validate'], {
    env: { ...process.env, DOTENV_PRIVATE_KEY: key, VERCEL_ENV: 'development' },
    stdio: 'ignore',
  })

  if (validation.error !== undefined || validation.status !== 0) {
    fail(
      'Unable to validate the encrypted development profile; check its key, HTTP origins and development deploy-key scope.',
    )
  }

  chmodSync(directory, 0o700)

  const temporary = path.join(directory, `.env.setup-${randomBytes(12).toString('hex')}.keys`)
  let descriptor: number | undefined

  try {
    descriptor = openSync(temporary, 'wx', 0o600)
    writeFileSync(descriptor, `DOTENV_PRIVATE_KEY=${key}\n`, 'utf-8')
    closeSync(descriptor)
    descriptor = undefined
    renameSync(temporary, keyFile)
  } finally {
    if (descriptor !== undefined) {
      closeSync(descriptor)
    }

    if (existsSync(temporary)) {
      unlinkSync(temporary)
    }
  }
}

try {
  if (process.argv[2] === '--read-key') {
    process.stdout.write(readKey())
  } else if (process.argv[2] === '--validate') {
    validateNativeValues()
  } else {
    setup()
  }
} catch (error) {
  process.stderr.write(
    `${Schema.is(SetupFailure)(error) ? error.message : 'Unable to prepare the local development profile and key.'}\n`,
  )
  process.exitCode = 1
}
