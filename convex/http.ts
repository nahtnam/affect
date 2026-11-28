import { constantTimeEqual } from 'better-auth/crypto'
import { Effect, Schema } from 'effect'
import { env, httpAction } from './_generated/server'
import { sendCode } from './developmentEmail'
import { httpRouter } from 'convex/server'

import { authComponent, createAuth } from './auth'

const http = httpRouter()

authComponent.registerRoutes(http, createAuth)

http.route({
  path: '/affect-preview/email',
  method: 'POST',
  handler: httpAction((ctx, request) =>
    Effect.runPromise(
      Effect.gen(function* capturePreview() {
        const secret = env.PREVIEW_INBOX_SECRET

        if (
          secret === undefined ||
          secret.length < 32 ||
          !constantTimeEqual(request.headers.get('authorization') ?? '', `Bearer ${secret}`)
        ) {
          return new Response(null, { status: 404 })
        }

        const body: unknown = yield* Effect.promise(() => request.json())

        const input = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            email: Schema.String.check(Schema.isMaxLength(254)),
            origin: Schema.String,
          }),
        )(body)

        const result = yield* sendCode(ctx, { ...input, cloudUrl: env.CONVEX_CLOUD_URL }, true)

        return Response.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
      }),
    ),
  ),
})

export default http
