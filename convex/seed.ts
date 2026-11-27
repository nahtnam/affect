import { v } from 'convex/values'
import { Clock, Effect, Schema } from 'effect'

import { components } from './_generated/api'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { internalMutation, internalQuery } from './_generated/server'

const email = 'demo@example.test'

const demoUsers = (ctx: Pick<QueryCtx, 'runQuery'>) =>
  ctx
    .runQuery(components.betterAuth.adapter.findMany, {
      model: 'user',
      where: [{ field: 'email', value: email }],
      paginationOpts: { cursor: null, numItems: 2 },
      select: ['email'],
    })
    .then(Schema.decodeUnknownPromise(Schema.Struct({ page: Schema.Array(Schema.Unknown) })))

export const count = internalQuery({
  args: {},
  returns: v.number(),
  handler: (ctx) => demoUsers(ctx).then(({ page }) => page.length),
})

export const populate = internalMutation({
  args: {},
  returns: v.null(),
  handler: Effect.fnUntraced(
    function* populate(ctx: MutationCtx) {
      const { page } = yield* Effect.promise(() => demoUsers(ctx))

      if (page.length === 0) {
        const now = yield* Clock.currentTimeMillis
        yield* Effect.promise(() =>
          ctx.runMutation(components.betterAuth.adapter.create, {
            input: {
              model: 'user',
              data: {
                name: 'Demo User',
                email,
                emailVerified: true,
                role: 'user',
                createdAt: now,
                updatedAt: now,
              },
            },
          }),
        )
      }

      return null
    },
    (program) => Effect.runPromise(program),
  ),
})
