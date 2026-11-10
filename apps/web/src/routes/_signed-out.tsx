import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import { privateHeaders } from '#/auth/private-headers'
import { routeViewer } from '#/auth/viewer'

export const Route = createFileRoute('/_signed-out')({
  beforeLoad: async ({ context, location }) => {
    if ((await routeViewer(context, location.href)) !== null) {
      redirect({ headers: privateHeaders, throw: true, to: '/app' })
    }
  },
  component: Outlet,
})
