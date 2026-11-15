import { scan } from '@dotenvx/primitives'
import { Array as EffectArray, Record, String as EffectString } from 'effect'

export const assertEncryptedProfile = (source: string) => {
  // Scan every stored assignment, including duplicates, without decrypting or expanding.
  const entries = Record.toEntries(scan(source).parsed)

  if (
    !EffectArray.some<[string, string[]]>(([, values]) =>
      EffectArray.some<string>((value) => EffectString.startsWith('encrypted:')(value))(values),
    )(entries) ||
    EffectArray.some<[string, string[]]>(
      ([name, values]) =>
        EffectString.startsWith('DOTENV_PRIVATE_KEY')(name) ||
        EffectArray.some<string>(
          (value) =>
            value !== '' &&
            name !== 'DOTENV_PUBLIC_KEY' &&
            !EffectString.startsWith('encrypted:')(value),
        )(values),
    )(entries)
  ) {
    throw new Error('Affect profiles must contain encrypted values and no private keys.')
  }
}
