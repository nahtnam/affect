import { useLocation, useNavigate } from '@tanstack/react-router'
import { useConvexAuth } from 'convex/react'
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

import { Button } from '#/components/ui/button'

import { authClient } from './client'
import { safeReturnTo } from './return-to'
import { fetchViewer, viewerQuery } from './viewer'

export const ProtectedContent = ({
  children,
  viewerId,
  requireAdmin = false,
}: {
  children: ReactNode
  viewerId: string
  requireAdmin?: boolean
}) => {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const session = authClient.useSession()
  const viewer = viewerQuery.useQuery()
  const location = useLocation()
  const navigate = useNavigate()
  const region = useRef<HTMLDivElement>(null)

  const accountChanged =
    (session.data?.user.id !== undefined && session.data.user.id !== viewerId) ||
    (viewer.data !== null && viewer.data !== undefined && viewer.data.id !== viewerId)

  const signedOut = isAuthenticated && viewer.data === null
  const transportUnavailable = !isLoading && !isAuthenticated
  const adminDenied = requireAdmin && viewer.data?.isAdmin === false

  useEffect(() => {
    let active = true

    const redirectToSignIn = () => {
      void navigate({
        reloadDocument: true,
        replace: true,
        search: { returnTo: safeReturnTo({ returnTo: location.href }) },
        to: '/sign-in',
      })
    }

    if (accountChanged) {
      window.location.replace(location.href)
    } else if (signedOut) {
      redirectToSignIn()
    } else if (transportUnavailable) {
      // A failed Convex token exchange does not establish that the cookie is invalid.
      const verify = async () => {
        try {
          const current = await fetchViewer()

          if (!active) {
            return
          }

          if (current === null) {
            redirectToSignIn()
          } else if (current.id !== viewerId) {
            window.location.replace(location.href)
          }
        } catch {
          // The retry state is already visible.
        }
      }

      void verify()
    } else if (adminDenied) {
      void navigate({ replace: true, to: '/app' })
    }

    return () => {
      active = false
    }
  }, [
    accountChanged,
    adminDenied,
    location.href,
    navigate,
    signedOut,
    transportUnavailable,
    viewerId,
  ])

  useEffect(() => {
    const hideBeforeCache = (event: PageTransitionEvent) => {
      if (event.persisted && region.current !== null) {
        region.current.style.visibility = 'hidden'
      }
    }

    const recheckAfterRestore = (event: PageTransitionEvent) => {
      if (event.persisted) {
        window.location.reload()
      }
    }

    window.addEventListener('pagehide', hideBeforeCache)
    window.addEventListener('pageshow', recheckAfterRestore)

    return () => {
      window.removeEventListener('pagehide', hideBeforeCache)
      window.removeEventListener('pageshow', recheckAfterRestore)
    }
  }, [])

  if (accountChanged || signedOut || (adminDenied && !transportUnavailable)) {
    return null
  }

  if (transportUnavailable || viewer.isError || session.error !== null) {
    return (
      <div
        className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-start gap-4 px-6 py-16"
        role="alert"
      >
        <h1 className="text-xl font-semibold">Could not verify your session.</h1>
        <Button
          onClick={() => {
            window.location.reload()
          }}
          type="button"
        >
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col" ref={region}>
      {children}
    </div>
  )
}
