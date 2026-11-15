import { env as runtimeEnv } from 'node:process'
import { config } from '@dotenvx/dotenvx'
import type { DotenvPopulateInput } from '@dotenvx/dotenvx'
import { Record, String as EffectString } from 'effect'

export const loadRuntimeEnvironment = (source: string | Uint8Array | null) => {
  try {
    const text = source instanceof Uint8Array ? new TextDecoder().decode(source) : source
    const key = runtimeEnv['DOTENV_PRIVATE_KEY']

    if (text === null || EffectString.trim(text).length === 0 || key === undefined || key === '') {
      throw new Error('Missing runtime profile or key.')
    }

    // Stage values so a failed decryption cannot partially initialize the app.
    const values: DotenvPopulateInput = { DOTENV_PRIVATE_KEY: key }

    const result = config({
      envs: [{ type: 'env', value: text, privateKeyName: 'DOTENV_PRIVATE_KEY' }],
      processEnv: values,
      strict: true,
      quiet: true,
      logLevel: 'error',
      noArmor: true,
      noNative: true,
      no1Password: true,
      noBitwarden: true,
    })

    if (result.error !== undefined) {
      throw result.error
    }

    for (const [name, value] of Record.toEntries(values)) {
      runtimeEnv[name] ??= value
    }
  } catch {
    throw new Error('Unable to initialize Affect runtime configuration.')
  }
}
