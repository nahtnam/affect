import { ConvexQueryClient } from '@convex-dev/react-query'
import { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'

import { env } from '#/env'

import { RoutePending } from './route-pending'
import { routeTree } from './routeTree.gen'

export type RouterContext = {
  convexQueryClient: ConvexQueryClient
  privateViewer: { id: string | null }
  queryClient: QueryClient
}

export const getRouter = () => {
  const privateViewer: RouterContext['privateViewer'] = { id: null }

  const convexQueryClient = new ConvexQueryClient(env.VITE_CONVEX_URL, {
    expectAuth: true,
  })

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: convexQueryClient.queryFn(),
        queryKeyHashFn: convexQueryClient.hashFn(),
      },
    },
  })

  convexQueryClient.connect(queryClient)

  const router = createRouter({
    context: { convexQueryClient, privateViewer, queryClient },
    dehydrate: () => ({ privateViewerId: privateViewer.id }),
    defaultPendingComponent: RoutePending,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    hydrate: ({ privateViewerId }) => {
      privateViewer.id = privateViewerId
    },
    routeTree,
    scrollRestoration: true,
  })

  setupRouterSsrQueryIntegration({
    dehydrateOptions: { shouldDehydrateQuery: (query) => query.state.status === 'success' },
    queryClient,
    router,
  })

  return router
}
