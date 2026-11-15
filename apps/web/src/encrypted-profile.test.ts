import { describe, expect, it } from 'vitest'

import { assertEncryptedProfile } from '../vite/encrypted-profile'

describe('encrypted profile packaging', () => {
  it('rejects unsafe assignments in either position among duplicates', () => {
    const encrypted = 'SECRET="encrypted:synthetic-ciphertext"'
    const plaintext = 'SECRET="synthetic-plaintext-secret"'
    const privateKey = 'DOTENV_PRIVATE_KEY="synthetic-private-key"'

    for (const source of [
      `${plaintext}\n${encrypted}`,
      `${encrypted}\n${plaintext}`,
      `${encrypted}\n${privateKey}\nDOTENV_PRIVATE_KEY=""`,
      `${encrypted}\nDOTENV_PRIVATE_KEY=""\n${privateKey}`,
    ]) {
      expect(() => {
        assertEncryptedProfile(source)
      }).toThrow('Affect profiles must contain encrypted values and no private keys.')
    }
  })
})
