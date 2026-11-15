import handler, { createServerEntry } from '@tanstack/react-start/server-entry'
import { Effect, Exit, Layer, ManagedRuntime } from 'effect'
import { FetchHttpClient, HttpClient } from 'effect/http'
import { OtlpSerialization, OtlpTracer } from 'effect/observability'

import { posthogConfig } from '#/env'

const collectorClient = Layer.effect(
  HttpClient.HttpClient,
  Effect.gen(function* makeCollectorClient() {
    const client = yield* HttpClient.HttpClient

    return client.pipe(
      HttpClient.tap((response) => response.arrayBuffer),
      HttpClient.timeout('1 second'),
    )
  }),
).pipe(Layer.provide(FetchHttpClient.layer))

const tracing =
  posthogConfig === undefined
    ? undefined
    : ManagedRuntime.make(
        OtlpTracer.layer({
          headers: { Authorization: `Bearer ${posthogConfig.key}` },
          resource: { serviceName: 'affect-web' },
          shutdownTimeout: '1 second',
          url: new URL('/i/v1/traces', posthogConfig.host).href,
        }).pipe(Layer.provide([collectorClient, OtlpSerialization.layerProtobuf])),
      )

// The exporter owns a shared scope. Requests only enqueue finished spans.
const tracingContext = tracing?.context().catch(() => null)

if (tracing !== undefined) {
  const dispose = () => {
    void tracing.dispose().catch(() => null)
  }

  globalThis.process?.once('beforeExit', dispose)
  import.meta.hot?.dispose(() => {
    globalThis.process?.removeListener('beforeExit', dispose)
    dispose()
  })
}

export default createServerEntry({
  fetch(request, options) {
    if (tracingContext === undefined) {
      return handler.fetch(request, options)
    }

    return tracingContext.then((context) => {
      if (context === null) {
        return handler.fetch(request, options)
      }

      return Effect.runPromiseWith(context)(
        Effect.suspend(() => {
          const response = handler.fetch(request, options)

          return response instanceof Response
            ? Effect.succeed(response)
            : Effect.promise(() => response)
        }).pipe(
          Effect.exit,
          Effect.tap((result) =>
            Effect.annotateCurrentSpan(
              'http.response.status_code',
              Exit.isSuccess(result) ? result.value.status : 500,
            ),
          ),
          Effect.withSpan('AffectWeb.request'),
          // Keep unexpected handler defects out of the OTLP span.
          Effect.flatten,
        ),
      )
    })
  },
})
