import { existsSync, readFileSync } from 'node:fs'
import type { Plugin } from 'vite'

import { assertEncryptedProfile } from './encrypted-profile'

export const createEncryptedProfilePlugin = ({
  profileDirectory,
  profile,
}: {
  profileDirectory: string
  profile: string
}): Plugin => ({
  name: 'affect-encrypted-profile',
  apply: 'build',
  enforce: 'pre',
  config() {
    if (!existsSync(`${profileDirectory}.env`)) {
      throw new Error(`Missing encrypted Affect profile: env/${profile}/.env`)
    }

    assertEncryptedProfile({ source: readFileSync(`${profileDirectory}.env`, 'utf-8'), profile })
  },
})
