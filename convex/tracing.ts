import { Effect, Layer, Option, Redacted } from 'effect'
import { FetchHttpClient } from 'effect/http'
import { OtlpSerialization, OtlpTracer } from 'effect/observability'

import { tracingEnvironment } from './env'

export const TracingLive = Layer.unwrap(
  tracingEnvironment.pipe(
    Effect.map(
      Option.match({
        onNone: () => Layer.empty,
        onSome: (env) =>
          OtlpTracer.layer({
            headers: {
              Authorization: `Bearer ${Redacted.value(env.POSTHOG_PROJECT_TOKEN)}`,
            },
            resource: { serviceName: 'affect-convex' },
            url: new URL('/i/v1/traces', env.POSTHOG_HOST).href,
          }),
      }),
    ),
  ),
).pipe(Layer.provide([FetchHttpClient.layer, OtlpSerialization.layerProtobuf]))
