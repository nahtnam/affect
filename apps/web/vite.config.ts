import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'
import { createLoopbackHostGuard } from './vite/loopback-host-guard'
import { resolveServerOptions } from './vite/server-options'

export default defineConfig(({ command, isPreview }) => {
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
