import { Array as EffectArray, DateTime, Option } from 'effect'
import { RefreshCw } from 'lucide-react'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { Button } from '#/components/ui/button'

import { developmentEmailAvailable, fetchEmailInbox } from './client'
import type { EmailPreview } from './contracts'
import { EmailPreviewPane } from './email-preview'

type InboxState = 'idle' | 'checking' | 'loading' | 'ready' | 'unavailable' | 'error'

type InboxSession = {
  controller: AbortController
  loading: boolean
}

type EmailClient = {
  checkAvailability: typeof developmentEmailAvailable
  fetchInbox: typeof fetchEmailInbox
}

const defaultEmailClient: EmailClient = {
  checkAvailability: developmentEmailAvailable,
  fetchInbox: fetchEmailInbox,
}

let activePaneDestroy: (() => void) | null = null

export const destroyAffectEmailsPanel = () => {
  activePaneDestroy?.()
}

const activeEmails = (emails: readonly EmailPreview[]) => {
  const now = DateTime.toEpochMillis(DateTime.nowUnsafe())

  return EffectArray.filter<EmailPreview>((email) => email.expiresAt > now)(emails)
}

const nowMillis = () => DateTime.toEpochMillis(DateTime.nowUnsafe())

const clearTimer = (timer: number | null) => {
  if (timer !== null && typeof window !== 'undefined') {
    window.clearTimeout(timer)
  }
}

const hasVisibleMount = (mount: HTMLElement) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false
  }

  const { ownerDocument } = mount
  const { defaultView: ownerWindow } = ownerDocument

  if (
    ownerDocument !== document ||
    ownerWindow !== window ||
    ownerDocument.visibilityState !== 'visible' ||
    !mount.isConnected ||
    ownerWindow?.ResizeObserver === undefined ||
    ownerWindow.MutationObserver === undefined ||
    ownerWindow.getComputedStyle(mount).visibility !== 'visible'
  ) {
    return false
  }

  let ancestor: HTMLElement | null = mount

  while (ancestor !== null) {
    if (ownerWindow.getComputedStyle(ancestor).visibility !== 'visible') {
      return false
    }

    if (ancestor === ownerDocument.documentElement) {
      break
    }

    ancestor = ancestor.parentElement
  }

  const { height, width } = mount.getBoundingClientRect()

  return width > 0 && height > 0
}

const StateMessage = ({ children }: { children: string }) => (
  <div className="p-4 text-sm text-muted-foreground">{children}</div>
)

const LoadEmailsPrompt = ({ onLoad }: { onLoad: () => void }) => (
  <div className="flex min-h-0 flex-1 flex-col items-start justify-center gap-2 p-4">
    <h2 className="text-sm font-semibold">Development emails</h2>
    <p className="text-sm text-muted-foreground">Load the local inbox for this visible session.</p>
    <Button type="button" onClick={onLoad}>
      Load emails
    </Button>
  </div>
)

const InboxContents = ({
  canCopy,
  emails,
  inboxState,
  onRefresh,
  onRetry,
  onSelect,
  selectedEmail,
}: {
  canCopy: () => boolean
  emails: readonly EmailPreview[]
  inboxState: InboxState
  onRefresh: () => void
  onRetry: () => void
  onSelect: (emailId: string) => void
  selectedEmail: EmailPreview | undefined
}) => {
  let notice: ReactNode = null

  if (inboxState === 'checking') {
    notice = <StateMessage>Checking local inbox…</StateMessage>
  } else if (inboxState === 'loading' && emails.length === 0) {
    notice = <StateMessage>Loading emails…</StateMessage>
  } else if (inboxState === 'unavailable') {
    notice = (
      <div className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
        <p>Local email preview is unavailable.</p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    )
  } else if (inboxState === 'error') {
    notice = (
      <div className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
        <p>Could not load development emails.</p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    )
  } else if (inboxState === 'ready' && emails.length === 0) {
    notice = <StateMessage>No development emails yet.</StateMessage>
  }

  const showInbox = emails.length > 0 && (inboxState === 'ready' || inboxState === 'loading')

  return (
    <>
      <header className="flex shrink-0 items-center justify-between border-b px-4 py-2">
        <h2 className="text-sm font-semibold">Development emails</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Refresh emails"
          disabled={inboxState === 'checking' || inboxState === 'loading'}
          onClick={onRefresh}
        >
          <RefreshCw
            aria-hidden="true"
            className={inboxState === 'checking' || inboxState === 'loading' ? 'animate-spin' : ''}
          />
        </Button>
      </header>
      {notice}
      {showInbox ? (
        <div className="grid min-h-0 flex-1 grid-rows-[auto_auto] overflow-y-auto @3xl:grid-cols-[14rem_minmax(0,1fr)] @3xl:grid-rows-1 @3xl:overflow-hidden">
          <aside
            className="border-b @3xl:max-h-none @3xl:overflow-y-auto @3xl:border-r @3xl:border-b-0"
            aria-label="Development emails"
          >
            {EffectArray.map<readonly EmailPreview[], ReactNode>((email) => (
              <button
                key={email.id}
                type="button"
                className="block w-full border-b px-3 py-3 text-left transition-colors hover:bg-muted/70 aria-[current=true]:bg-muted"
                onClick={() => {
                  onSelect(email.id)
                }}
                aria-current={email.id === selectedEmail?.id ? 'true' : undefined}
              >
                <span className="block truncate text-sm font-medium">{email.subject}</span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  {email.to}
                </span>
              </button>
            ))(emails)}
          </aside>
          {selectedEmail === undefined ? (
            <StateMessage>Select an email to preview it.</StateMessage>
          ) : (
            <EmailPreviewPane
              key={selectedEmail.id}
              email={selectedEmail}
              canCopy={() => canCopy() && selectedEmail.expiresAt > nowMillis()}
            />
          )}
        </div>
      ) : null}
    </>
  )
}

export const EmailsPanel = ({
  emailClient = defaultEmailClient,
  mount,
}: {
  emailClient?: EmailClient
  mount: HTMLElement
}) => {
  const [eligible, setEligible] = useState(() => hasVisibleMount(mount))
  const [activeSession, setActiveSession] = useState<InboxSession | null>(null)
  const [inboxState, setInboxState] = useState<InboxState>('idle')
  const [emails, setEmails] = useState<readonly EmailPreview[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const eligibleRef = useRef(eligible)
  const sessionRef = useRef<InboxSession | null>(null)
  const pollTimerRef = useRef<number | null>(null)
  const expiryTimerRef = useRef<number | null>(null)

  const stopSession = useCallback((clearState = true) => {
    const session = sessionRef.current
    sessionRef.current = null
    session?.controller.abort()

    clearTimer(pollTimerRef.current)
    clearTimer(expiryTimerRef.current)
    pollTimerRef.current = null
    expiryTimerRef.current = null

    if (clearState) {
      setActiveSession(null)
      setInboxState('idle')
      setEmails([])
      setSelectedId(null)
    }
  }, [])

  const updateEligibility = useCallback(
    (next: boolean) => {
      if (eligibleRef.current === next) {
        return
      }

      eligibleRef.current = next

      if (!next) {
        stopSession()
      }

      setEligible(next)
    },
    [stopSession],
  )

  const refreshEligibility = useCallback(() => {
    updateEligibility(hasVisibleMount(mount))
  }, [mount, updateEligibility])

  const sessionIsCurrent = useCallback(
    (session: InboxSession) => {
      if (sessionRef.current !== session || session.controller.signal.aborted) {
        return false
      }

      const visible = hasVisibleMount(mount)

      if (!visible) {
        updateEligibility(false)

        return false
      }

      return eligibleRef.current
    },
    [mount, updateEligibility],
  )

  useLayoutEffect(() => {
    const { ownerDocument } = mount
    const { defaultView: ownerWindow } = ownerDocument
    let observer: ResizeObserver | null = null
    let ancestorObserver: MutationObserver | null = null
    const observedAncestors = new Set<Element>()

    const observeAncestors = () => {
      ancestorObserver?.disconnect()
      observedAncestors.clear()

      let ancestor: HTMLElement | null = mount

      while (ancestor !== null) {
        observedAncestors.add(ancestor)
        ancestorObserver?.observe(ancestor, {
          attributes: true,
          attributeFilter: ['class', 'hidden', 'style'],
          childList: true,
        })

        if (ancestor === ownerDocument.documentElement) {
          return
        }

        ancestor = ancestor.parentElement
      }
    }

    const onVisibilityTransition = (event: TransitionEvent) => {
      if (
        ownerWindow === null ||
        event.propertyName !== 'visibility' ||
        !(event.target instanceof ownerWindow.Element) ||
        !observedAncestors.has(event.target)
      ) {
        return
      }

      refreshEligibility()
    }

    if (ownerWindow !== null && ownerWindow.ResizeObserver !== undefined) {
      observer = new ownerWindow.ResizeObserver(refreshEligibility)
      observer.observe(mount)
    }

    if (ownerWindow !== null && ownerWindow.MutationObserver !== undefined) {
      ancestorObserver = new ownerWindow.MutationObserver(() => {
        observeAncestors()
        refreshEligibility()
      })
      observeAncestors()
    }

    ownerDocument.addEventListener('visibilitychange', refreshEligibility)
    ownerDocument.addEventListener('transitionend', onVisibilityTransition, true)
    ownerDocument.addEventListener('transitioncancel', onVisibilityTransition, true)
    ownerWindow?.addEventListener('pageshow', refreshEligibility)

    let active = true

    const onPageHide = () => {
      stopSession()
    }

    ownerWindow?.addEventListener('pagehide', onPageHide)
    ownerWindow?.queueMicrotask(() => {
      if (active) {
        refreshEligibility()
      }
    })

    return () => {
      active = false
      observer?.disconnect()
      ancestorObserver?.disconnect()
      ownerDocument.removeEventListener('visibilitychange', refreshEligibility)
      ownerDocument.removeEventListener('transitionend', onVisibilityTransition, true)
      ownerDocument.removeEventListener('transitioncancel', onVisibilityTransition, true)
      ownerWindow?.removeEventListener('pageshow', refreshEligibility)
      ownerWindow?.removeEventListener('pagehide', onPageHide)
    }
  }, [mount, refreshEligibility, stopSession])

  useLayoutEffect(() => {
    const destroy = () => {
      if (activePaneDestroy === destroy) {
        activePaneDestroy = null
      }

      updateEligibility(false)
    }

    activePaneDestroy = destroy

    return () => {
      if (activePaneDestroy === destroy) {
        activePaneDestroy = null
      }

      stopSession(false)
    }
  }, [stopSession, updateEligibility])

  const scheduleExpiry = useCallback(
    function scheduleExpiryForSession(session: InboxSession, nextEmails: readonly EmailPreview[]) {
      clearTimer(expiryTimerRef.current)
      expiryTimerRef.current = null

      if (nextEmails.length === 0) {
        return
      }

      const nextExpiry = Math.min(
        ...EffectArray.map<readonly EmailPreview[], number>((email) => email.expiresAt)(nextEmails),
      )

      const delay = Math.max(0, nextExpiry - nowMillis() + 1)

      expiryTimerRef.current = window.setTimeout(() => {
        expiryTimerRef.current = null

        if (!sessionIsCurrent(session)) {
          return
        }

        const currentEmails = activeEmails(nextEmails)
        setEmails(currentEmails)
        setSelectedId((currentId) =>
          EffectArray.some<EmailPreview>((email) => email.id === currentId)(currentEmails)
            ? currentId
            : (currentEmails[0]?.id ?? null),
        )
        scheduleExpiryForSession(session, currentEmails)
      }, delay)
    },
    [sessionIsCurrent],
  )

  const loadInbox = useCallback(
    function loadInboxForSession(session: InboxSession) {
      if (!sessionIsCurrent(session) || session.loading) {
        return Promise.resolve()
      }

      session.loading = true
      clearTimer(pollTimerRef.current)
      pollTimerRef.current = null
      setInboxState('loading')

      return emailClient
        .fetchInbox(session.controller.signal)
        .then((result) => {
          if (!sessionIsCurrent(session)) {
            return null
          }

          if (result.kind === 'unavailable') {
            clearTimer(expiryTimerRef.current)
            expiryTimerRef.current = null
            setEmails([])
            setSelectedId(null)
            setInboxState('unavailable')

            return 'unavailable'
          }

          const nextEmails = activeEmails(result.inbox.emails)
          setEmails(nextEmails)
          setSelectedId((currentId) =>
            EffectArray.some<EmailPreview>((email) => email.id === currentId)(nextEmails)
              ? currentId
              : (nextEmails[0]?.id ?? null),
          )
          setInboxState('ready')
          scheduleExpiry(session, nextEmails)

          return 'available'
        })
        .catch(() => {
          if (!sessionIsCurrent(session)) {
            return null
          }

          clearTimer(expiryTimerRef.current)
          expiryTimerRef.current = null
          setEmails([])
          setSelectedId(null)
          setInboxState('error')

          return 'retry'
        })
        .then((outcome) => {
          session.loading = false

          if (outcome === 'unavailable' || !sessionIsCurrent(session)) {
            return null
          }

          clearTimer(pollTimerRef.current)
          pollTimerRef.current = window.setTimeout(() => {
            pollTimerRef.current = null
            void loadInboxForSession(session)
          }, 5000)

          return null
        })
    },
    [emailClient, scheduleExpiry, sessionIsCurrent],
  )

  const checkAvailability = useCallback(
    (session: InboxSession) => {
      if (!sessionIsCurrent(session)) {
        return Promise.resolve()
      }

      setInboxState('checking')

      return emailClient.checkAvailability(session.controller.signal).then((available) => {
        if (sessionIsCurrent(session)) {
          if (available) {
            return loadInbox(session)
          }

          setInboxState('unavailable')
        }

        return null
      })
    },
    [emailClient, loadInbox, sessionIsCurrent],
  )

  const startSession = () => {
    refreshEligibility()

    if (!eligibleRef.current || sessionRef.current !== null) {
      return
    }

    const session: InboxSession = {
      controller: new AbortController(),
      loading: false,
    }

    sessionRef.current = session
    setActiveSession(session)
    void checkAvailability(session)
  }

  const retry = () => {
    const session = sessionRef.current

    if (session === null || !sessionIsCurrent(session)) {
      return
    }

    if (inboxState === 'unavailable') {
      void checkAvailability(session)
    } else {
      void loadInbox(session)
    }
  }

  const session = activeSession
  let selectedEmail: EmailPreview | undefined

  if (session !== null) {
    selectedEmail =
      Option.getOrUndefined(
        EffectArray.findFirst<EmailPreview>((email) => email.id === selectedId)(emails),
      ) ?? emails[0]
  }

  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    mount.ownerDocument !== document ||
    mount.ownerDocument.defaultView !== window
  ) {
    return (
      <section
        className="flex h-full min-h-0 w-full items-center justify-center p-4 text-sm text-muted-foreground ph-no-capture ph-no-record"
        aria-label="Development email preview"
      >
        Open Emails in the app window.
      </section>
    )
  }

  const visible = eligible && hasVisibleMount(mount)
  let content: ReactNode = null

  if (visible && session === null) {
    content = <LoadEmailsPrompt onLoad={startSession} />
  } else if (visible && session !== null) {
    content = (
      <InboxContents
        canCopy={() => sessionIsCurrent(session)}
        emails={emails}
        inboxState={inboxState}
        onRefresh={() => {
          if (inboxState === 'unavailable') {
            void checkAvailability(session)
          } else {
            void loadInbox(session)
          }
        }}
        onRetry={retry}
        onSelect={(emailId) => {
          if (sessionIsCurrent(session)) {
            setSelectedId(emailId)
          }
        }}
        selectedEmail={selectedEmail}
      />
    )
  }

  return (
    <section
      className="@container flex h-full min-h-0 w-full flex-col overflow-hidden bg-card text-card-foreground ph-no-capture ph-no-record"
      aria-label="Development emails"
    >
      {content}
    </section>
  )
}
