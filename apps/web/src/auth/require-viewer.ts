import { redirect } from '@tanstack/react-router'

import type { RouterContext } from '#/router'
import { privateHeaders } from '#/auth/private-headers'
import { safeReturnTo } from '#/auth/return-to'
import { routeViewer } from '#/auth/viewer'

export const requireViewer = async ({
  context,
  location,
}: {
  context: RouterContext
  location: { href: string }
}) => {
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
}
