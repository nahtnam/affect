import { redirect } from '@tanstack/react-router'
import { createIsomorphicFn, createServerFn } from '@tanstack/react-start'
import { setResponseHeaders } from '@tanstack/react-start/server'
import { createConvexRouteQuery } from 'convex-route-query'
import { ConvexHttpClient } from 'convex/browser'

import { env } from '#/env'
import { api } from '@convex/_generated/api'

import type { RouterContext } from '../router'
import { privateHeaders } from './private-headers'
import { readViewer } from './server.server'

export const viewerQuery = createConvexRouteQuery(api.auth.currentUser)
const viewerQueryKey = viewerQuery.options().queryKey

export const fetchViewer = createServerFn({ method: 'GET' }).handler(() => {
  setResponseHeaders(new Headers(privateHeaders))

  return readViewer(new ConvexHttpClient(env.VITE_CONVEX_URL, { logger: false }))
})

export const routeViewer = createIsomorphicFn()
  .server(
    async ({ convexQueryClient, privateViewer, queryClient }: RouterContext, _href: string) => {
      setResponseHeaders(new Headers(privateHeaders))

      const client = convexQueryClient.serverHttpClient

      if (client === undefined) {
        throw new Error('Could not verify your session. Please try again.')
      }

      const viewer = await readViewer(client)

      if (viewer !== null) {
        privateViewer.id = viewer.id
        queryClient.setQueryData(viewerQueryKey, viewer)
      }

      return viewer
    },
  )
  .client(async ({ privateViewer, queryClient }: RouterContext, href: string) => {
    const viewer = await fetchViewer()

    // A live viewer update can arrive before the other private query results.
    if (privateViewer.id !== null && privateViewer.id !== viewer?.id) {
      redirect({ href, reloadDocument: true, throw: true })
    }

    if (viewer !== null) {
      privateViewer.id = viewer.id
      queryClient.setQueryData(viewerQueryKey, viewer)
    }

    return viewer
  })
