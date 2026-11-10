// @vitest-environment happy-dom

import { Array as EffectArray, Option, String as EffectString } from 'effect'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { affectEmailsPlugin } from '#/devtools'
import type { EmailPreview } from './contracts'
import type { EmailInboxResult } from './client'
import { EmailsPanel } from './emails-panel'

const client = {
  checkAvailability: vi.fn<(signal?: AbortSignal) => Promise<boolean>>(),
  fetchInbox: vi.fn<(signal?: AbortSignal) => Promise<EmailInboxResult>>(),
}

let resizeCallback: ResizeObserverCallback | undefined
let mutationCallback: MutationCallback | undefined
let mutationTargets = new Set<Node>()
let mutationObserverInstance: MutationObserver
const roots: Root[] = []

const resizeObserverInstance: ResizeObserver = {
  disconnect: vi.fn<() => void>(),
  observe: vi.fn<(target: Element, options?: ResizeObserverOptions) => void>(),
  unobserve: vi.fn<(target: Element) => void>(),
}

class ControlledResizeObserver implements ResizeObserver {
  private readonly targets = new Set<Element>()

  disconnect() {
    this.targets.clear()
  }

  observe(target: Element) {
    this.targets.add(target)
  }

  unobserve(target: Element) {
    this.targets.delete(target)
  }

  constructor(callback: ResizeObserverCallback) {
    resizeCallback = callback
  }
}

const createMutationObserver = (callback: MutationCallback): MutationObserver => {
  mutationCallback = callback
  mutationTargets = new Set()
  mutationObserverInstance = {
    disconnect: () => {
      mutationTargets.clear()
    },
    observe: (target) => {
      mutationTargets.add(target)
    },
    takeRecords: () => [],
  }

  return mutationObserverInstance
}

const ControlledMutationObserver = function ControlledMutationObserver(callback: MutationCallback) {
  return createMutationObserver(callback)
}

const email: EmailPreview = {
  code: '123456',
  createdAt: Date.now(),
  expiresAt: Date.now() + 60_000,
  from: 'Affect',
  html: '<p>synthetic preview</p>',
  id: 'synthetic-email',
  subject: 'Synthetic sign-in message',
  text: 'synthetic preview',
  to: 'sample@example.test',
}

const secondEmail: EmailPreview = {
  ...email,
  code: '654321',
  html: '<p>second synthetic preview</p>',
  id: 'second-synthetic-email',
  subject: 'Second synthetic message',
  to: 'second@example.test',
}

const availableInbox = (emails: readonly EmailPreview[]): EmailInboxResult => ({
  inbox: { emails },
  kind: 'available',
})

const renderPlugin = ({ initiallyHidden = false }: { initiallyHidden?: boolean } = {}) => {
  const wrapper = document.createElement('div')
  const mount = document.createElement('div')
  document.documentElement.style.visibility = 'visible'
  document.body.style.visibility = 'visible'
  wrapper.style.visibility = initiallyHidden ? 'hidden' : 'visible'
  mount.style.visibility = 'visible'
  wrapper.append(mount)
  document.body.append(wrapper)

  Object.defineProperty(mount, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(0, 0, 640, 480),
  })

  const root = createRoot(mount)
  roots.push(root)

  act(() => {
    root.render(<EmailsPanel emailClient={client} mount={mount} />)
  })

  return { mount, root, wrapper }
}

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

const click = async (button: HTMLButtonElement) => {
  await act(async () => {
    button.click()
    await flushPromises()
  })
}

const findButton = (mount: HTMLElement, label: string) => {
  const button = Option.getOrUndefined(
    EffectArray.findFirst<HTMLButtonElement>(
      (candidate) =>
        candidate.textContent === label ||
        EffectString.startsWith(label)(candidate.textContent ?? ''),
    )([...mount.querySelectorAll('button')]),
  )

  if (button === undefined) {
    throw new TypeError(`Expected a button labeled ${label}.`)
  }

  return button
}

const findRefreshButton = (mount: HTMLElement) => {
  const button = mount.querySelector<HTMLButtonElement>('button[aria-label="Refresh emails"]')

  if (button === null) {
    throw new TypeError('Expected the refresh button.')
  }

  return button
}

const expectPreviewCleared = (mount: HTMLElement) => {
  expect(mount.textContent).not.toMatch(/synthetic preview|Synthetic sign-in message/u)
}

const triggerResize = () => {
  resizeCallback?.([], resizeObserverInstance)
}

const triggerMutation = () => {
  mutationCallback?.([], mutationObserverInstance)
}

describe('TanStack Devtools Emails panel lifecycle', () => {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    client.checkAvailability.mockReset()
    client.fetchInbox.mockReset()
    resizeCallback = undefined
    mutationCallback = undefined
    mutationTargets = new Set()
    Object.defineProperty(window, 'ResizeObserver', {
      configurable: true,
      value: ControlledResizeObserver,
    })
    Object.defineProperty(window, 'MutationObserver', {
      configurable: true,
      value: ControlledMutationObserver,
    })
  })

  afterEach(() => {
    act(() => {
      for (const root of roots.splice(0)) {
        root.unmount()
      }
    })
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.documentElement.style.removeProperty('visibility')
    document.body.replaceChildren()
  })

  it('waits for local Load emails intent and checks availability before reading the inbox', async () => {
    client.checkAvailability.mockResolvedValue(true)
    client.fetchInbox.mockResolvedValue(availableInbox([email]))

    const { mount } = renderPlugin()

    expect({
      button: EffectString.includes('Load emails')(mount.textContent ?? ''),
      statusCalls: client.checkAvailability.mock.calls.length,
      inboxCalls: client.fetchInbox.mock.calls.length,
    }).toStrictEqual({ button: true, statusCalls: 0, inboxCalls: 0 })

    await click(findButton(mount, 'Load emails'))

    expect({
      statusCalls: client.checkAvailability.mock.calls.length,
      inboxCalls: client.fetchInbox.mock.calls.length,
      hasSubject: EffectString.includes('Synthetic sign-in message')(mount.textContent ?? ''),
    }).toStrictEqual({ statusCalls: 1, inboxCalls: 1, hasSubject: true })
  })

  it('shows an unavailable retry state without reading emails until status allows it', async () => {
    client.checkAvailability.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    client.fetchInbox.mockResolvedValue(availableInbox([]))

    const { mount } = renderPlugin()
    await click(findButton(mount, 'Load emails'))

    expect({
      unavailable: EffectString.includes('Local email preview is unavailable.')(
        mount.textContent ?? '',
      ),
      inboxCalls: client.fetchInbox.mock.calls.length,
    }).toStrictEqual({ unavailable: true, inboxCalls: 0 })

    await click(findButton(mount, 'Try again'))

    expect({
      statusCalls: client.checkAvailability.mock.calls.length,
      inboxCalls: client.fetchInbox.mock.calls.length,
      empty: EffectString.includes('No development emails yet.')(mount.textContent ?? ''),
    }).toStrictEqual({ statusCalls: 2, inboxCalls: 1, empty: true })
  })

  it('aborts and clears email content when the observed pane loses visible geometry', async () => {
    const pending = Promise.withResolvers<EmailInboxResult>()
    let pendingSignal: AbortSignal | undefined

    client.checkAvailability.mockResolvedValue(true)
    client.fetchInbox
      .mockResolvedValueOnce(availableInbox([email]))
      .mockImplementationOnce((signal) => {
        pendingSignal = signal

        return pending.promise
      })

    const { mount } = renderPlugin()
    await click(findButton(mount, 'Load emails'))
    await click(findRefreshButton(mount))

    expect(pendingSignal?.aborted).toBeFalsy()

    Object.defineProperty(mount, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(0, 0, 0, 0),
    })

    await act(async () => {
      triggerResize()
      await flushPromises()
    })

    expect(pendingSignal?.aborted).toBeTruthy()
    expectPreviewCleared(mount)

    await act(async () => {
      pending.resolve(availableInbox([email]))
      await flushPromises()
    })

    expectPreviewCleared(mount)
  })

  it('clears the active session through the native plugin destroy callback', async () => {
    client.checkAvailability.mockResolvedValue(true)
    client.fetchInbox.mockResolvedValue(availableInbox([email]))

    const { mount } = renderPlugin()
    await click(findButton(mount, 'Load emails'))
    expect(mount.textContent).toContain('Synthetic sign-in message')

    act(() => affectEmailsPlugin.destroy?.('affect-emails'))

    expectPreviewCleared(mount)
  })

  it('keeps the selected Source view and focus through a delayed background poll', async () => {
    vi.useFakeTimers()
    const pending = Promise.withResolvers<EmailInboxResult>()
    client.checkAvailability.mockResolvedValue(true)
    client.fetchInbox
      .mockResolvedValueOnce(availableInbox([email, secondEmail]))
      .mockReturnValueOnce(pending.promise)

    const { mount } = renderPlugin()
    await click(findButton(mount, 'Load emails'))
    await click(findButton(mount, 'Second synthetic message'))
    const sourceTab = findButton(mount, 'Source')
    await click(sourceTab)
    act(() => {
      sourceTab.focus()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
      await flushPromises()
    })

    expect({
      inboxCalls: client.fetchInbox.mock.calls.length,
      selectedSource: sourceTab.dataset['state'],
      focusPreserved: document.activeElement === sourceTab,
      content: mount.querySelector('pre')?.textContent,
    }).toStrictEqual({
      inboxCalls: 2,
      selectedSource: 'active',
      focusPreserved: true,
      content: secondEmail.html,
    })

    await act(async () => {
      pending.resolve(availableInbox([email, secondEmail]))
      await flushPromises()
    })
  })

  it('recovers from a failed read on the next interval without a second click', async () => {
    vi.useFakeTimers()
    client.checkAvailability.mockResolvedValue(true)
    client.fetchInbox
      .mockRejectedValueOnce(new Error('synthetic read failure'))
      .mockResolvedValueOnce(availableInbox([email]))

    const { mount } = renderPlugin()
    await click(findButton(mount, 'Load emails'))
    expect(
      EffectString.includes('Could not load development emails.')(mount.textContent ?? ''),
    ).toBeTruthy()
    expect(client.fetchInbox).toHaveBeenCalledOnce()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4999)
    })
    expect(client.fetchInbox).toHaveBeenCalledOnce()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
      await flushPromises()
    })

    expect({
      inboxCalls: client.fetchInbox.mock.calls.length,
      recovered: EffectString.includes('Synthetic sign-in message')(mount.textContent ?? ''),
    }).toStrictEqual({ inboxCalls: 2, recovered: true })
  })

  it('aborts on a hidden ancestor without geometry change and requires fresh local activation', async () => {
    const pending = Promise.withResolvers<EmailInboxResult>()
    let pendingSignal: AbortSignal | undefined

    client.checkAvailability.mockResolvedValue(true)
    client.fetchInbox
      .mockImplementationOnce((signal) => {
        pendingSignal = signal

        return pending.promise
      })
      .mockResolvedValueOnce(availableInbox([email]))

    const { mount, wrapper } = renderPlugin()
    await click(findButton(mount, 'Load emails'))

    expect(mutationTargets.has(wrapper)).toBeTruthy()
    expect(pendingSignal?.aborted).toBeFalsy()

    wrapper.style.visibility = 'hidden'

    await act(async () => {
      triggerMutation()
      await flushPromises()
    })

    expect(pendingSignal?.aborted).toBeTruthy()

    await act(async () => {
      pending.resolve(availableInbox([email]))
      await flushPromises()
    })

    expectPreviewCleared(mount)

    wrapper.style.visibility = 'visible'

    await act(async () => {
      triggerMutation()
      await flushPromises()
    })

    await click(findButton(mount, 'Load emails'))

    expect({
      statusCalls: client.checkAvailability.mock.calls.length,
      inboxCalls: client.fetchInbox.mock.calls.length,
      hasSubject: EffectString.includes('Synthetic sign-in message')(mount.textContent ?? ''),
    }).toStrictEqual({ statusCalls: 2, inboxCalls: 2, hasSubject: true })
  })

  it.each(['transitionend', 'transitioncancel'] as const)(
    'shows Load emails after an ancestor visibility %s without reading until activation',
    async (transitionType) => {
      const { mount, wrapper } = renderPlugin({ initiallyHidden: true })

      expect(EffectString.includes('Load emails')(mount.textContent ?? '')).toBeFalsy()

      wrapper.style.visibility = 'visible'
      mount.style.visibility = 'hidden'

      await act(async () => {
        triggerMutation()
        await flushPromises()
      })

      expect({
        button: EffectString.includes('Load emails')(mount.textContent ?? ''),
        statusCalls: client.checkAvailability.mock.calls.length,
        inboxCalls: client.fetchInbox.mock.calls.length,
      }).toStrictEqual({ button: false, statusCalls: 0, inboxCalls: 0 })

      mount.style.removeProperty('visibility')
      const event = new Event(transitionType, { bubbles: true })
      Object.defineProperty(event, 'propertyName', { value: 'visibility' })

      await act(async () => {
        wrapper.dispatchEvent(event)
        await flushPromises()
      })

      expect({
        button: EffectString.includes('Load emails')(mount.textContent ?? ''),
        statusCalls: client.checkAvailability.mock.calls.length,
        inboxCalls: client.fetchInbox.mock.calls.length,
      }).toStrictEqual({ button: true, statusCalls: 0, inboxCalls: 0 })
    },
  )

  it('aborts and clears the session when the host closes', async () => {
    const pending = Promise.withResolvers<EmailInboxResult>()
    let pendingSignal: AbortSignal | undefined

    client.checkAvailability.mockResolvedValue(true)
    client.fetchInbox.mockImplementation((signal) => {
      pendingSignal = signal

      return pending.promise
    })

    const { mount } = renderPlugin()
    await click(findButton(mount, 'Load emails'))

    act(() => {
      affectEmailsPlugin.destroy?.('affect-emails')
    })

    expect(pendingSignal?.aborted).toBeTruthy()
    expectPreviewCleared(mount)
  })
})
