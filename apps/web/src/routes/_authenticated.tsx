import { createFileRoute, Outlet, redirect, useMatch } from '@tanstack/react-router'

import { ProtectedContent } from '#/auth/guard'
import { privateHeaders } from '#/auth/private-headers'
import { safeReturnTo } from '#/auth/return-to'
import { routeViewer } from '#/auth/viewer'

const AuthenticatedLayout = () => {
  const { viewerId } = Route.useRouteContext()
  const admin = useMatch({ from: '/_authenticated/admin', shouldThrow: false })

  return (
    <ProtectedContent requireAdmin={admin !== undefined} viewerId={viewerId}>
      <Outlet />
    </ProtectedContent>
  )
}

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context, location }) => {
    const viewer = await routeViewer(context, location.href)

    if (viewer === null) {
      redirect({
        headers: privateHeaders,
        search: { returnTo: safeReturnTo({ returnTo: location.href }) },
        to: '/sign-in',
        throw: true,
      })

      throw new Error('Could not verify your session. Please try again.')
    }

    return { viewerId: viewer.id, isAdmin: viewer.isAdmin }
  },
  component: AuthenticatedLayout,
})
