import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    exclude: ['**/node_modules/**', '**/.output/**', '**/dist/**'],
    include: ['convex/**/*.test.ts', 'apps/web/src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
  },
})
