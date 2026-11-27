import { createFileRoute, Outlet } from '@tanstack/react-router'

import { ProtectedContent } from '#/auth/guard'
import { requireViewer } from '#/auth/require-viewer'

const UserLayout = () => {
  const { viewerId } = Route.useRouteContext()

  return (
    <ProtectedContent viewerId={viewerId}>
      <Outlet />
    </ProtectedContent>
  )
}

export const Route = createFileRoute('/_with-user')({
  beforeLoad: requireViewer,
  component: UserLayout,
})
