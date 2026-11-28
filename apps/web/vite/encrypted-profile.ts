import { scan } from '@dotenvx/primitives'
import { Array as EffectArray, Record, String as EffectString } from 'effect'

export const assertEncryptedProfile = ({
  source,
  profile,
}: {
  source: string
  profile?: string
}) => {
  // Scan every stored assignment, including duplicates, without decrypting or expanding.
  const { parsed } = scan(source)
  const entries = Record.toEntries(parsed)

  const hasInboxSecret = EffectArray.some<string>(EffectString.startsWith('encrypted:'))(
    parsed['PREVIEW_INBOX_SECRET'] ?? [],
  )

  if (profile !== undefined && profile !== 'preview' && hasInboxSecret) {
    throw new Error('Only the preview profile may contain an encrypted PREVIEW_INBOX_SECRET.')
  }

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

  return hasInboxSecret
}
