import { describe, expect, it, vi } from 'vitest'

import { assertEncryptedProfile } from '../vite/encrypted-profile'

describe('encrypted profile packaging', () => {
  it('allows the optional inbox capability in the preview profile', () => {
    const standard = 'SETTING="encrypted:synthetic"'
    const preview = `${standard}\nPREVIEW_INBOX_SECRET="encrypted:synthetic"`
    expect(() => {
      assertEncryptedProfile({ source: preview, profile: 'production' })
    }).toThrow('Only the preview')
    expect(assertEncryptedProfile({ source: standard, profile: 'preview' })).toBeFalsy()
    expect(assertEncryptedProfile({ source: preview, profile: 'preview' })).toBeTruthy()
    expect(() => {
      assertEncryptedProfile({ source: standard, profile: 'production' })
    }).not.toThrow()
  })

  it('syncs the optional preview setting and rejects short secrets before writing settings', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')

    try {
      const { default: declaration, preparePreviewSettings } =
        await import('../../../convex/env.config')

      const cloud = 'https://fixture.convex.cloud'
      expect(declaration).toHaveProperty('PREVIEW_INBOX_SECRET.isOptional', 'optional')
      expect(preparePreviewSettings({ cloud })).toStrictEqual({ PREVIEW_INBOX_CLOUD_URL: '' })
      expect(
        preparePreviewSettings({ secret: 'synthetic-secret-longer-than-32-characters', cloud }),
      ).toStrictEqual({
        PREVIEW_INBOX_CLOUD_URL: cloud,
      })
      expect(() => preparePreviewSettings({ secret: 'short', cloud })).toThrow('at least 32')
    } finally {
      vi.unstubAllEnvs()
    }
  })

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
        assertEncryptedProfile({ source })
      }).toThrow('Affect profiles must contain encrypted values and no private keys.')
    }
  })
})
