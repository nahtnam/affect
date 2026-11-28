import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfigFromFile, resolveConfig } from 'vite'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createEncryptedProfilePlugin } from '../vite/encrypted-profile-plugin'

const directories: string[] = []
const encrypted = 'SECRET="encrypted:synthetic-ciphertext"'
const plaintext = 'SECRET="synthetic-plaintext-secret"'
const privateKey = 'DOTENV_PRIVATE_KEY="synthetic-private-key"'

describe('encrypted profile Vite lifecycle', () => {
  afterEach(async () => {
    vi.unstubAllEnvs()
    const removals: Promise<void>[] = []

    for (const directory of directories.splice(0)) {
      removals.push(rm(directory, { recursive: true, force: true }))
    }

    await Promise.all(removals)
  })

  it('loads actual build config metadata without a CI profile or private key', async () => {
    vi.stubEnv('CI', 'true')
    vi.stubEnv('VERCEL_ENV', undefined)
    vi.stubEnv('DOTENV_PRIVATE_KEY', undefined)

    // Like Knip, this loads the factory without running Vite's plugin hooks.
    const result = await loadConfigFromFile(
      { command: 'build', mode: 'production' },
      fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    )

    expect(result).not.toBeNull()
    expect(result?.config.plugins).toContainEqual(
      expect.objectContaining({ name: 'affect-encrypted-profile', apply: 'build', enforce: 'pre' }),
    )
  })

  it.each([
    ['missing', undefined, 'Missing encrypted Affect profile: env/ci/.env'],
    ['plaintext only', plaintext],
    ['mixed plaintext', `${encrypted}\nOTHER="synthetic-plaintext"`],
    ['private key', `${encrypted}\n${privateKey}`],
    ['plaintext before ciphertext', `${plaintext}\n${encrypted}`],
    ['plaintext after ciphertext', `${encrypted}\n${plaintext}`],
    ['private key before empty duplicate', `${encrypted}\n${privateKey}\nDOTENV_PRIVATE_KEY=""`],
    ['private key after empty duplicate', `${encrypted}\nDOTENV_PRIVATE_KEY=""\n${privateKey}`],
  ])(
    'rejects %s before downstream build config hooks',
    async (
      _name,
      source,
      message = 'Affect profiles must contain encrypted values and no private keys.',
    ) => {
      const directory = await mkdtemp(path.join(tmpdir(), 'affect-profile-plugin-'))
      directories.push(directory)

      if (source !== undefined) {
        await writeFile(path.join(directory, '.env'), source)
      }

      const downstream = vi.fn<() => void>()

      await expect(
        resolveConfig(
          {
            root: directory,
            configFile: false,
            envDir: false,
            plugins: [
              { name: 'downstream-config', config: downstream },
              createEncryptedProfilePlugin({ profileDirectory: `${directory}/`, profile: 'ci' }),
            ],
          },
          'build',
        ),
      ).rejects.toThrow(message)
      expect(downstream).not.toHaveBeenCalled()
    },
  )

  it.each(['ci', 'preview'])(
    'allows a %s profile without an inbox secret through build config resolution',
    async (profile) => {
      const directory = await mkdtemp(path.join(tmpdir(), 'affect-profile-plugin-'))
      directories.push(directory)
      await writeFile(
        path.join(directory, '.env'),
        `${encrypted}\nDOTENV_PUBLIC_KEY="synthetic-public-key"`,
      )
      const downstream = vi.fn<() => void>()

      await resolveConfig(
        {
          root: directory,
          configFile: false,
          envDir: false,
          plugins: [
            { name: 'downstream-config', config: downstream },
            createEncryptedProfilePlugin({ profileDirectory: `${directory}/`, profile }),
          ],
        },
        'build',
      )

      expect(downstream).toHaveBeenCalledOnce()
    },
  )
})
