import { ConvexBetterAuthProvider } from '@convex-dev/better-auth/react'
import type { ConvexReactClient } from 'convex/react'
import type { ReactNode } from 'react'

import { authClient } from '#/auth/client'

const AppConvexProvider = ({
  children,
  client,
}: {
  children: ReactNode
  client: ConvexReactClient
}) => (
  <ConvexBetterAuthProvider authClient={authClient} client={client}>
    {children}
  </ConvexBetterAuthProvider>
)

export default AppConvexProvider
