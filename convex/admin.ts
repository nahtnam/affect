import { v } from 'convex/values'
import { Effect } from 'effect'

import { query } from './_generated/server'
import { requirePlatformAdmin } from './auth'

export const viewer = query({
  args: {},
  handler: (ctx) =>
    Effect.runPromise(
      requirePlatformAdmin(ctx).pipe(Effect.map((user) => ({ email: user.email, id: user._id }))),
    ),
  returns: v.object({ email: v.string(), id: v.string() }),
})
