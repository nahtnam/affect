import { createApi } from '@convex-dev/better-auth'

import { createAuthOptions } from '../auth'
import schema from './schema'

export const {
  create,
  consumeOne,
  findOne,
  findMany,
  incrementOne,
  updateOne,
  updateMany,
  deleteOne,
  deleteMany,
} = createApi(schema, createAuthOptions)
