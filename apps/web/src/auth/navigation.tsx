import { Link } from '@tanstack/react-router'
import { useConvexAuth } from 'convex/react'

import { Button } from '#/components/ui/button'
import { Spinner } from '#/components/ui/spinner'

import { authClient } from './client'
import { SignOut } from './sign-out'
import { viewerQuery } from './viewer'

export const Navbar = () => {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const session = authClient.useSession()
  const viewer = viewerQuery.useQuery({}, { enabled: isAuthenticated })
  const user = !viewer.isError && (isLoading || isAuthenticated) ? viewer.data : null
  const hasViewer = user !== null && user !== undefined
  const hasSession = session.error === null && session.data !== null
  const signedOut = !session.isPending && session.error === null && session.data === null
  const pending = !hasViewer && (isLoading || (isAuthenticated && viewer.isPending))

  let accountControl = null

  if (hasViewer || hasSession) {
    accountControl = <SignOut />
  } else if (signedOut && !pending) {
    accountControl = (
      <Button asChild size="sm">
        <Link preload={false} to="/sign-in">
          Sign in
        </Link>
      </Button>
    )
  }

  return (
    <header className="border-border border-b">
      <nav
        aria-label="Primary navigation"
        className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6"
      >
        <Link
          className="shrink-0 text-sm font-semibold tracking-tight"
          to={hasViewer ? '/app' : '/'}
        >
          Affect
        </Link>
        <div className="flex items-center gap-2">
          {hasViewer && user.isAdmin ? (
            <Button asChild size="sm" variant="ghost">
              <Link preload={false} to="/admin">
                Admin
              </Link>
            </Button>
          ) : null}
          {pending ? <Spinner aria-label="Loading navigation" /> : null}
          {accountControl}
        </div>
      </nav>
    </header>
  )
}
