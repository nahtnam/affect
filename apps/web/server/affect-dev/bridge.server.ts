import { Effect, Redacted, Schema } from 'effect'
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/http'

import { EmailMessage } from '../../src/affect-dev/contracts'
import type { getAffectDevTarget } from './request-gate.server'

type Target = NonNullable<ReturnType<typeof getAffectDevTarget>>

const DevelopmentDeployment = Schema.Struct({
  deploymentType: Schema.Literal('dev'),
  kind: Schema.Literal('cloud'),
})

const DeliveryReply = Schema.Struct({
  status: Schema.Literal('success'),
  value: Schema.Union([
    Schema.Struct({
      status: Schema.Literals(['failed', 'invalid', 'rateLimited', 'sent', 'unavailable']),
    }),
    Schema.Struct({
      email: EmailMessage,
      status: Schema.Literal('captured'),
    }),
  ]),
})

const attestDevelopmentTarget = (target: Target) =>
  HttpClient.get(`${target.cloudUrl}/api/v1/deployment_info`, {
    headers: { authorization: `Convex ${Redacted.value(target.key)}` },
  }).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.flatMap(HttpClientResponse.schemaBodyJson(DevelopmentDeployment)),
  )

const requestOptions = { cache: 'no-store', redirect: 'error' } satisfies RequestInit

export const runBridge = <A, E>(operation: Effect.Effect<A, E, HttpClient.HttpClient>) =>
  Effect.runPromise(
    operation.pipe(
      Effect.withTracerEnabled(false),
      Effect.provideService(HttpClient.TracerPropagationEnabled, false),
      Effect.provideService(FetchHttpClient.RequestInit, requestOptions),
      Effect.provide(FetchHttpClient.layer),
    ),
  )

export const developmentTargetAvailable = (target: Target) =>
  attestDevelopmentTarget(target).pipe(
    Effect.as(true),
    Effect.timeout('3 seconds'),
    Effect.orElseSucceed(() => false),
  )

export const requestDevelopmentCode = ({ target, email }: { target: Target; email: string }) =>
  Effect.gen(function* sendSignInCode() {
    yield* attestDevelopmentTarget(target).pipe(Effect.timeout('3 seconds'))

    const request = yield* HttpClientRequest.post(
      `${target.cloudUrl}/api/run/developmentEmail/send`,
      { headers: { authorization: `Convex ${Redacted.value(target.key)}` } },
    ).pipe(
      HttpClientRequest.bodyJson({
        args: { cloudUrl: target.cloudUrl, email, origin: target.origin },
        format: 'json',
      }),
    )

    const reply = yield* HttpClient.execute(request).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.flatMap(HttpClientResponse.schemaBodyJson(DeliveryReply)),
    )

    return reply.value
  }).pipe(
    Effect.timeout('20 seconds'),
    Effect.orElseSucceed(() => null),
  )
