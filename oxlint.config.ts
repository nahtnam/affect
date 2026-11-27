import { antipattern, correctness, effectNative, strict, style } from '@effect/tsgo/oxlint-presets'
import { defineConfig } from 'oxlint'
import antiSlop from 'ultracite/oxlint/anti-slop'
import core from 'ultracite/oxlint/core'
import react from 'ultracite/oxlint/react'
import tanstack from 'ultracite/oxlint/tanstack'
import vitest from 'ultracite/oxlint/vitest'

export default defineConfig({
  extends: [
    core,
    tanstack,
    react,
    vitest,
    antiSlop,
    correctness,
    antipattern,
    effectNative,
    style,
    strict,
  ],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    // Downloaded native tools and their caches are local setup artifacts.
    '.setup.local/**',
    'apps/web/src/routeTree.gen.ts',
    'apps/web/src/components/ui/**',
    'convex/_generated/**',
    'convex/betterAuth/_generated/**',
    'convex/betterAuth/schema.ts',
    '.agents/**',
  ],
  jsPlugins: ['@eslint-community/eslint-plugin-eslint-comments'],
  options: {
    denyWarnings: true,
    reportUnusedDisableDirectives: 'error',
    respectEslintDisableDirectives: false,
    typeAware: true,
  },
  overrides: [
    {
      // The local launcher filters the process environment and polls its child sequentially.
      files: ['scripts/local.ts'],
      rules: {
        'node/no-process-env': 'off',
        'eslint/no-await-in-loop': 'off',
        'effecttsgo/async-function': 'off',
        'effecttsgo/schema-sync': 'off',
        'effecttsgo/node-builtin-import': 'off',
        'effecttsgo/process-env': 'off',
      },
    },
    {
      // Local setup and its fixtures are native process/filesystem boundaries; domain values use Effect Schema.
      files: ['scripts/validate-development-setup.ts', 'tests/setup.test.ts'],
      rules: {
        'effecttsgo/node-builtin-import': 'off',
        'effecttsgo/process-env': 'off',
        'node/no-process-env': 'off',
      },
    },
    {
      // Vite 8.3.6 declares these names as interfaces for global declaration merging; remove when that API changes.
      files: ['apps/web/src/vite-env.d.ts'],
      rules: {
        'typescript/consistent-type-definitions': 'off',
      },
    },
    {
      // Vite's config boundary reads native process/filesystem values for Portless and encrypted profile packaging.
      files: ['apps/web/vite.config.ts'],
      rules: {
        'effecttsgo/prefer-effect-string': 'off',
        'effecttsgo/node-builtin-import': 'off',
        'effecttsgo/process-env': 'off',
        'node/no-process-env': 'off',
      },
    },
    {
      // Native Vite config hooks and their filesystem fixtures validate encrypted build inputs.
      files: [
        'apps/web/vite/encrypted-profile-plugin.ts',
        'apps/web/src/encrypted-profile-plugin.test.ts',
      ],
      rules: {
        'effecttsgo/node-builtin-import': 'off',
      },
    },
    {
      files: ['convex/**/*.ts'],
      jsPlugins: ['@convex-dev/eslint-plugin'],
      rules: {
        '@convex-dev/explicit-table-ids': 'error',
        '@convex-dev/import-wrong-runtime': 'error',
        '@convex-dev/no-collect-in-query': 'error',
        '@convex-dev/no-duplicate-indexes': 'error',
        '@convex-dev/no-filter-in-query': 'error',
        '@convex-dev/no-old-registered-function-syntax': 'error',
        '@convex-dev/no-process-env': 'error',
        '@convex-dev/no-schema-import-cycle': 'error',
        '@convex-dev/no-top-of-hour-crons': 'error',
        '@convex-dev/require-args-validator': 'error',
        'eslint/no-restricted-properties': [
          'error',
          {
            property: 'getUserIdentity',
            message:
              'Use the Better Auth component to validate the current session, or requirePlatformAdmin(ctx) for admin access.',
          },
        ],
        // Convex uses camelCase modules and the existing auth.config / test suffix conventions.
        'unicorn/filename-case': ['error', { case: 'camelCase' }],
      },
    },
    {
      // Vitest test callbacks and native promise fixtures are runner boundaries; remove when async-function recognizes them.
      files: ['**/*.test.{ts,tsx}', 'tests/**/*.ts', 'apps/web/tests/**/*.tsx'],
      rules: {
        'effecttsgo/async-function': 'off',
      },
    },
    {
      // These callbacks return native Promises required by React actions, TanStack Start/Router, Convex clients, and React.lazy.
      // Remove each file when Effect tsgo recognizes its framework boundary or the callback no longer uses that native API.
      files: [
        'apps/web/src/auth/guard.tsx',
        'apps/web/src/auth/server.server.ts',
        'apps/web/src/auth/sign-in-form.tsx',
        'apps/web/src/auth/sign-out.tsx',
        'apps/web/src/auth/viewer.ts',
        'apps/web/src/routes/__root.tsx',
        'apps/web/src/routes/_authenticated.admin.tsx',
        'apps/web/src/routes/_authenticated.tsx',
        'apps/web/src/routes/_signed-out.sign-in.tsx',
        'apps/web/src/routes/_signed-out.tsx',
        'apps/web/src/start.ts',
      ],
      rules: {
        'effecttsgo/async-function': 'off',
      },
    },
    {
      // This shared fixture exposes native Promise helpers for Convex, Better Auth and provider test adapters.
      // Remove when callers no longer need this fixture API or the Effect rule supports its boundary.
      files: ['tests/auth.ts'],
      rules: {
        'effecttsgo/missing-pipeable-signature': 'off',
      },
    },
    {
      // These fixtures use native Node filesystem/process or HTTP APIs at their test boundaries.
      // Remove when the fixtures no longer use those APIs or Effect tsgo recognizes these boundaries.
      files: [
        'apps/web/src/auth/initial-response.test.ts',
        'apps/web/src/runtime-env.server.test.ts',
      ],
      rules: {
        'effecttsgo/global-fetch': 'off',
        'effecttsgo/node-builtin-import': 'off',
      },
    },
    {
      files: ['**/*.test.{ts,tsx}', 'tests/**/*.ts'],
      rules: {
        'effecttsgo/global-date': 'off',
        'effecttsgo/schema-sync': 'off',
      },
    },
  ],
  rules: {
    '@eslint-community/eslint-comments/no-restricted-disable': ['error', '*'],
    'node/no-process-env': 'error',
    'promise/prefer-await-to-callbacks': 'off',
    'promise/prefer-await-to-then': 'off',
    'typescript/consistent-type-definitions': ['error', 'type'],
    'typescript/promise-function-async': 'off',
    'unicorn/throw-new-error': 'off',
  },
})
