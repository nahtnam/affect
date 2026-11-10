import { Effect, Option, pipe, Schema, String } from 'effect'
import { defineHandler } from 'nitro'
import { assertBodySize } from 'nitro/h3'

import { EmailRequest } from '../../../src/affect-dev/contracts'
import { requestDevelopmentCode, runBridge } from '../../affect-dev/bridge.server'
import { addEmailPreview } from '../../affect-dev/inbox.server'
import { getAffectDevTarget, privateHeaders } from '../../affect-dev/request-gate.server'

const reply = (status: number, message?: string, preview = false) =>
  Response.json(
    { error: message === undefined ? null : { message }, preview },
    { headers: privateHeaders, status },
  )

const emailJson = Schema.fromJsonString(EmailRequest)

export default defineHandler((event) => {
  const target = getAffectDevTarget({ request: event.req, method: 'POST' })

  if (target === null) {
    return reply(404, 'Development email is unavailable.')
  }

  const contentType = pipe(
    event.req.headers.get('content-type') ?? '',
    String.split(';'),
    ([type]) => String.toLowerCase(String.trim(type)),
  )

  if (contentType !== 'application/json') {
    return reply(415, 'Expected a JSON request.')
  }

  const input = Effect.tryPromise({
    catch: () => 'invalid body',
    try: () => assertBodySize(event, 2048).then(() => event.req.text()),
  }).pipe(
    Effect.flatMap((body) => Schema.decodeEffect(emailJson)(body)),
    Effect.option,
  )

  return runBridge(
    Effect.gen(function* sendCode() {
      const decoded = yield* input

      if (Option.isNone(decoded)) {
        return reply(400, 'Enter a valid email address.')
      }

      const result = yield* requestDevelopmentCode({ target, email: decoded.value.email })

      if (result?.status === 'captured') {
        return addEmailPreview(result.email)
          ? reply(200, undefined, true)
          : reply(503, 'Could not save the preview. Request a new code.')
      }

      if (result?.status === 'sent') {
        return reply(200)
      }

      if (result?.status === 'invalid') {
        return reply(400, 'Enter a valid email address.')
      }

      if (result?.status === 'rateLimited') {
        return reply(429, 'Too many requests. Please try again later.')
      }

      return reply(503, 'Could not send sign-in code.')
    }),
  )
})
