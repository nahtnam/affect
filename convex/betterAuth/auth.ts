import { betterAuth } from 'better-auth/minimal'

import type { QueryCtx } from '../_generated/server'
import { createAuthOptions } from '../auth'

const schemaContextUnavailable = (): never => {
  throw new Error('The Better Auth schema configuration has no Convex runtime context.')
}

// Better Auth needs the real Convex adapter to generate its schema.
const schemaContext: QueryCtx = {
  get auth() {
    return schemaContextUnavailable()
  },
  get db() {
    return schemaContextUnavailable()
  },
  get meta() {
    return schemaContextUnavailable()
  },
  runQuery: schemaContextUnavailable,
  get storage() {
    return schemaContextUnavailable()
  },
}

export const auth = betterAuth(createAuthOptions(schemaContext))
