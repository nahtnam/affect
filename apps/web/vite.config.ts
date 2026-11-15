import { devtools } from '@tanstack/devtools-vite'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'
import { assertEncryptedProfile } from './vite/encrypted-profile'
import { createLoopbackHostGuard } from './vite/loopback-host-guard'
import { resolveServerOptions } from './vite/server-options'

export default defineConfig(({ command, isPreview }) => {
  const requestedProfile = process.env['VERCEL_ENV']

  const defaultProfile =
    process.env['CI'] === 'true' || process.env['GITHUB_ACTIONS'] === 'true' ? 'ci' : 'development'

  const profile =
    requestedProfile !== undefined && requestedProfile !== '' ? requestedProfile : defaultProfile

  if (!['development', 'preview', 'production', 'ci'].includes(profile)) {
    throw new Error('Unsupported Affect environment profile.')
  }

  const profileDirectory = fileURLToPath(new URL(`../../env/${profile}/`, import.meta.url))

  if (command === 'build' && !existsSync(`${profileDirectory}.env`)) {
    throw new Error(`Missing encrypted Affect profile: env/${profile}/.env`)
  }

  if (command === 'build') {
    assertEncryptedProfile(readFileSync(`${profileDirectory}.env`, 'utf-8'))
  }

  const { host, port, portlessHost, portlessAuthority } = resolveServerOptions({
    command,
    isPreview,
    environment: {
      HOST: process.env['HOST'],
      PORT: process.env['PORT'],
      PORTLESS_URL: process.env['PORTLESS_URL'],
    },
  })

  return {
    resolve: { tsconfigPaths: true },
    server: {
      host,
      port,
      strictPort: true,
      allowedHosts: [
        'localhost',
        '127.0.0.1',
        ...(portlessHost === undefined ? [] : [portlessHost]),
      ],
    },
    preview: {
      host: '127.0.0.1',
      strictPort: true,
    },
    plugins: [
      devtools({
        eventBusConfig: { enabled: false },
        consolePiping: { enabled: false },
      }),
      createLoopbackHostGuard(portlessAuthority),
      tailwindcss(),
      tanstackStart(),
      nitro({
        serverDir: 'server',
        // Keep dotenvx's CommonJS dependencies native in Node server artifacts.
        traceDeps: ['@dotenvx/dotenvx'],
        serverAssets: [{ baseName: 'affect-profile', dir: profileDirectory, pattern: '.env' }],
        routeRules: {
          '/**': {
            headers: {
              'X-Content-Type-Options': 'nosniff',
              'X-Frame-Options': 'SAMEORIGIN',
            },
          },
        },
      }),
      viteReact(),
    ],
    ssr: { noExternal: ['@convex-dev/better-auth'] },
  }
})
