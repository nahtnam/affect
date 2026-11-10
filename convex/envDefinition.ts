import type { EnvDefinition } from 'convex/server'
import { v } from 'convex/values'

export default {
  BETTER_AUTH_SECRET: v.string(),
  CLOUDFLARE_ACCOUNT_ID: v.string(),
  CLOUDFLARE_API_TOKEN: v.string(),
  EMAIL_FROM: v.string(),
  POSTHOG_HOST: v.optional(v.string()),
  // The component requires a string; an empty token disables analytics.
  POSTHOG_PROJECT_TOKEN: v.string(),
  SITE_URL: v.string(),
  TRUSTED_ORIGINS: v.string(),
} satisfies EnvDefinition
