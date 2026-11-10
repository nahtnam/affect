import {
  ClientOnly,
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
  useRouter,
} from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'
import type { ReactNode } from 'react'

import { Navbar } from '#/auth/navigation'
import { Button } from '#/components/ui/button'
import ConvexProvider from '#/integrations/convex/provider'
import PostHogProvider from '#/integrations/posthog/provider'
import type { RouterContext } from '#/router'

import appCss from '../styles.css?url'

const DevelopmentDevtools = import.meta.env.DEV
  ? lazy(async () => {
      const devtools = await import('#/devtools')

      return { default: devtools.Devtools }
    })
  : null

const RouteError = ({ reset }: ErrorComponentProps) => {
  const router = useRouter()

  return (
    <div
      className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-start gap-4 px-6 py-16"
      role="alert"
    >
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <Button
        onClick={() => {
          void router.invalidate().then(reset)
        }}
        type="button"
      >
        Try again
      </Button>
    </div>
  )
}

const RootDocument = ({ children }: { children: ReactNode }) => {
  const { convexQueryClient } = Route.useRouteContext()

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <ConvexProvider client={convexQueryClient.convexClient}>
          <PostHogProvider>
            <div className="flex min-h-dvh flex-col">
              <a className="sr-only focus:not-sr-only focus:p-3" href="#main-content">
                Skip to content
              </a>
              <Navbar />
              <main className="flex flex-1 flex-col" id="main-content" tabIndex={-1}>
                {children}
              </main>
            </div>
            {DevelopmentDevtools === null ? null : (
              <ClientOnly>
                <Suspense fallback={null}>
                  <DevelopmentDevtools />
                </Suspense>
              </ClientOnly>
            )}
          </PostHogProvider>
        </ConvexProvider>
        <Scripts />
      </body>
    </html>
  )
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  errorComponent: RouteError,
  head: () => ({
    links: [{ href: appCss, rel: 'stylesheet' }],
    meta: [
      { charSet: 'utf-8' },
      { content: 'width=device-width, initial-scale=1', name: 'viewport' },
      { title: 'Affect' },
    ],
  }),
  shellComponent: RootDocument,
})
