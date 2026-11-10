import { Array, DateTime } from 'effect'

import type { EmailMessage, EmailPreview } from '../../src/affect-dev/contracts'

type Inbox = {
  emails: EmailPreview[]
  nextId: number
  expiry?: { cancel: () => void; deadline: number }
}

declare global {
  // The Nitro Vite worker owns this state, including across its module reloads.
  var affectDevEmailInbox: Inbox | undefined
}

const capacity = 10
const lifetimeMs = 5 * 60_000
const timeNow = () => DateTime.toEpochMillis(DateTime.nowUnsafe())

const purge = (inbox: Inbox, now: number) => {
  inbox.emails = Array.filter<EmailPreview>((email) => email.expiresAt > now)(inbox.emails)
  const deadline = Math.min(...Array.map((email: EmailPreview) => email.expiresAt)(inbox.emails))

  if (inbox.expiry?.deadline === deadline) {
    return
  }

  inbox.expiry?.cancel()
  delete inbox.expiry

  if (Number.isFinite(deadline)) {
    // Node's timeout signal does not keep the dev worker alive during shutdown.
    const signal = AbortSignal.timeout(Math.ceil(deadline - now))

    const expire = () => {
      if (inbox.expiry?.deadline === deadline) {
        delete inbox.expiry
        purge(inbox, timeNow())
      }
    }

    signal.addEventListener('abort', expire, { once: true })

    inbox.expiry = {
      cancel: () => {
        signal.removeEventListener('abort', expire)
      },
      deadline,
    }
  }
}

export const readEmailInbox = () => {
  const inbox = globalThis.affectDevEmailInbox

  if (inbox === undefined) {
    return []
  }

  purge(inbox, timeNow())

  return inbox.emails
}

export const addEmailPreview = (message: typeof EmailMessage.Type) => {
  const now = timeNow()

  if (
    message.expiresAt <= now ||
    message.expiresAt > now + lifetimeMs ||
    message.expiresAt - message.createdAt !== lifetimeMs
  ) {
    return false
  }

  globalThis.affectDevEmailInbox ??= { emails: [], nextId: 1 }
  const inbox = globalThis.affectDevEmailInbox
  const active = Array.filter<EmailPreview>((email) => email.expiresAt > now)(inbox.emails)
  inbox.emails = [{ ...message, id: String(inbox.nextId) }, ...active.slice(0, capacity - 1)]
  inbox.nextId += 1
  purge(inbox, now)

  return true
}
