import { PostHogProvider as Provider } from '@posthog/react'
import { Predicate } from 'effect'
import { posthog } from 'posthog-js'
import { useEffect } from 'react'
import type { ReactNode } from 'react'

import { authClient } from '#/auth/client'
import { posthogConfig } from '#/env'

if (typeof window !== 'undefined' && posthogConfig !== undefined) {
  posthog.init(posthogConfig.key, {
    api_host: posthogConfig.host,
    autocapture: false,
    capture_dead_clicks: false,
    capture_heatmaps: false,
    defaults: '2026-05-30',
    disable_capture_url_hashes: true,
    disable_session_recording: true,
  })
}

const AnalyticsIdentity = () => {
  const { data, error, isPending } = authClient.useSession()
  const id = data?.user.id

  useEffect(() => {
    if (!isPending && error === null) {
      if (id !== undefined && id !== '') {
        posthog.identify(id)
      } else if (Predicate.isString(posthog.get_property('$user_id'))) {
        posthog.reset()
      }
    }
  }, [error, id, isPending])

  return null
}

const PostHogProvider = ({ children }: { children: ReactNode }) => {
  if (posthogConfig === undefined) {
    return children
  }

  return (
    <Provider client={posthog}>
      <AnalyticsIdentity />
      {children}
    </Provider>
  )
}

export default PostHogProvider
