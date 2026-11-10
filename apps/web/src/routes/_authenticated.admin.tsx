import { createFileRoute, redirect } from '@tanstack/react-router'
import { createConvexRouteQuery } from 'convex-route-query'

import { privateHeaders } from '#/auth/private-headers'
import { api } from '@convex/_generated/api'

const adminViewerQuery = createConvexRouteQuery('adminViewer', api.admin.viewer)

const Admin = () => {
  const { viewerId } = Route.useRouteContext()
  const { data, error } = adminViewerQuery.useSuspenseRouteQuery(Route)

  if (error !== null || data.id !== viewerId) {
    throw new Error('Could not load the admin page. Please try again.')
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-2 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Administration</h1>
      <p className="text-muted-foreground text-sm">{data.email}</p>
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/admin')({
  beforeLoad: ({ context }) => {
    if (!context.isAdmin) {
      redirect({ headers: privateHeaders, throw: true, to: '/app' })
    }
  },
  component: Admin,
  loader: async (loaderContext) => {
    try {
      const { data, routeData } = await adminViewerQuery.fetchRoute(loaderContext)

      if (data.id !== loaderContext.context.viewerId) {
        throw new Error('Unexpected viewer.')
      }

      return routeData
    } catch {
      throw new Error('Could not load the admin page. Please try again.')
    }
  },
})
