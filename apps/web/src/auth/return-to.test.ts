import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'

import type { ReturnToInput } from './return-to'
import { DEFAULT_RETURN_TO, parseReturnTo } from './return-to'

describe('return-to validation', () => {
  it.effect('accepts a padded local path, query, and fragment', () =>
    Effect.gen(function* validReturnTo() {
      const result = yield* parseReturnTo({
        returnTo: '  /projects?view=list#details  ',
      })

      const nestedPath = yield* parseReturnTo({
        returnTo: '/projects/sign-in',
      })

      const parentPath = yield* parseReturnTo({ returnTo: '/sign-in/..' })

      assert.strictEqual(result, '/projects?view=list#details')
      assert.strictEqual(nestedPath, '/projects/sign-in')
      assert.strictEqual(parentPath, '/')
    }),
  )

  it.effect('falls back for missing, duplicate, malformed, and looping paths', () =>
    Effect.gen(function* invalidReturnTo() {
      const inputs: readonly ReturnToInput[] = [
        {},
        { returnTo: ['/projects', '/app'] },
        { returnTo: 'https://evil.example/' },
        { returnTo: '//evil.example/' },
        { returnTo: '/x/..//evil.example' },
        { returnTo: '/%73ign-in/' },
        { returnTo: '/projects\\details' },
      ]

      for (const input of inputs) {
        const result = yield* parseReturnTo(input)

        assert.strictEqual(result, DEFAULT_RETURN_TO)
      }
    }),
  )

  it.effect('rejects sign-in dot-segment and encoded forms', () =>
    Effect.gen(function* loopingReturnTo() {
      for (const returnTo of [
        '/projects/../sign-in',
        '/projects/%2e%2e/sign-in',
        '/sign-in/',
        'projects',
        '',
      ]) {
        const result = yield* parseReturnTo({ returnTo })

        assert.strictEqual(result, DEFAULT_RETURN_TO)
      }
    }),
  )
})
