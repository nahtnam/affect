import { assert, it } from '@effect/vitest'
import { Effect, Exit } from 'effect'

import { calculateAvailability } from './effect'

it.effect('decodes, normalizes and computes domain values', () =>
  Effect.gen(function* schemaSuccess() {
    const input = yield* calculateAvailability({
      label: '  Example  ',
      quantity: 10,
      reserved: 3,
    })

    assert.deepStrictEqual(input, {
      available: 7,
      label: 'Example',
      quantity: 10,
      reserved: 3,
    })
  }),
)

it.effect('rejects invalid input as typed failures, not defects', () =>
  Effect.gen(function* schemaFailures() {
    const exit = yield* Effect.exit(
      calculateAvailability({
        label: 'Example',
        quantity: 10,
        reserved: 11,
      }),
    )

    assert.isTrue(Exit.hasFails(exit))
    assert.isFalse(Exit.hasDies(exit))
  }),
)
