import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import { ProtectedContent } from '#/auth/guard'
import { privateHeaders } from '#/auth/private-headers'
import { requireViewer } from '#/auth/require-viewer'

const AdminLayout = () => {
  const { viewerId } = Route.useRouteContext()

  return (
    <ProtectedContent requireAdmin viewerId={viewerId}>
      <Outlet />
    </ProtectedContent>
  )
}

export const Route = createFileRoute('/_with-admin')({
  beforeLoad: async (options) => {
    const viewer = await requireViewer(options)

    if (!viewer.isAdmin) {
      redirect({ headers: privateHeaders, throw: true, to: '/app' })
    }

    return viewer
  },
  component: AdminLayout,
})
