import type { EnvDefinition } from 'convex/server'
import { v } from 'convex/values'

// Explicit browser-safe additions; the CLI supplies the canonical Convex URLs.
export const publicEnv = ['VITE_SITE_URL', 'VITE_POSTHOG_HOST', 'VITE_POSTHOG_KEY'] as const

export default {
  BETTER_AUTH_SECRET: v.string(),
  CLOUDFLARE_ACCOUNT_ID: v.string(),
  CLOUDFLARE_API_TOKEN: v.string(),
  EMAIL_FROM: v.string(),
  EMAIL_FROM_NAME: v.optional(v.string()),
  POSTHOG_HOST: v.optional(v.string()),
  // The component requires a string; an empty token disables analytics.
  POSTHOG_PROJECT_TOKEN: v.string(),
  PREVIEW_INBOX_SECRET: v.optional(v.string()),
  SITE_URL: v.string(),
  TRUSTED_ORIGINS: v.string(),
} satisfies EnvDefinition
