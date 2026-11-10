import migrations from '@convex-dev/migrations/convex.config.js'
import rateLimiter from '@convex-dev/rate-limiter/convex.config.js'
import workflow from '@convex-dev/workflow/convex.config.js'
import posthog from '@posthog/convex/convex.config.js'
import { defineApp } from 'convex/server'

import betterAuth from './betterAuth/convex.config'
import env from './envDefinition'

const app = defineApp({
  env,
})

app.use(betterAuth)

app.use(rateLimiter)

app.use(migrations)

app.use(workflow)

app.use(posthog, {
  env: {
    POSTHOG_HOST: app.env.POSTHOG_HOST,
    POSTHOG_PROJECT_TOKEN: app.env.POSTHOG_PROJECT_TOKEN,
  },
})

export default app
