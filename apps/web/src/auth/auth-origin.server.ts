import { env as runtimeEnv } from 'node:process'
import { Option, Schema } from 'effect'

import { env, origin } from '#/env'

export const authOrigin = () => {
  const portlessOrigin = runtimeEnv['PORTLESS_URL']

  const configured =
    import.meta.env.DEV && portlessOrigin !== undefined && portlessOrigin !== ''
      ? portlessOrigin
      : env.VITE_SITE_URL

  const parsed = Schema.decodeUnknownOption(origin)(configured)

  if (Option.isNone(parsed)) {
    throw new Error("Affect's site origin is not configured.")
  }

  return parsed.value
}
