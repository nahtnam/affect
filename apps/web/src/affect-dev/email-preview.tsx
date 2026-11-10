import { DateTime } from 'effect'
import { useState } from 'react'
import type { ReactNode } from 'react'

import { Button } from '#/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'

import type { EmailPreview } from './contracts'
import { createEmailPreviewDocument } from './preview-document'

type PreviewTab = 'preview' | 'text' | 'source'

type EmailPreviewProps = {
  canCopy: () => boolean
  email: EmailPreview
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const formatDate = (timestamp: number) => dateFormatter.format(timestamp)

const nowMillis = () => DateTime.toEpochMillis(DateTime.nowUnsafe())

const EmptyContent = ({ message }: { message: string }) => (
  <div className="flex min-h-72 items-center justify-center rounded-md border border-dashed bg-background p-6 text-center text-sm text-muted-foreground">
    {message}
  </div>
)

export const EmailPreviewPane = ({ canCopy, email }: EmailPreviewProps) => {
  const [activeTab, setActiveTab] = useState<PreviewTab>('preview')
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  const hasHtml = email.html !== undefined && email.html.length > 0
  const hasText = email.text !== undefined && email.text.length > 0
  const renderedSource = email.html ?? email.text ?? ''
  const hasRenderedSource = renderedSource.length > 0
  let copyLabel = 'Copy code'

  if (copyState === 'copied') {
    copyLabel = 'Copied'
  } else if (copyState === 'failed') {
    copyLabel = 'Copy failed'
  }

  const copyCode = () => {
    const { code } = email

    if (code === undefined || email.expiresAt <= nowMillis() || !canCopy()) {
      setCopyState('failed')

      return Promise.resolve()
    }

    const writeCode = () => {
      if (email.expiresAt <= nowMillis() || !canCopy()) {
        throw new Error('Email code is no longer available.')
      }

      return navigator.clipboard.writeText(code)
    }

    return Promise.resolve()
      .then(writeCode)
      .then(() => {
        setCopyState('copied')

        return true
      })
  }

  let previewContent: ReactNode

  if (hasHtml) {
    previewContent = (
      <iframe
        className="h-full min-h-72 w-full rounded-md border bg-background"
        title={`Preview of ${email.subject}`}
        srcDoc={createEmailPreviewDocument(email.html ?? '')}
        sandbox=""
        referrerPolicy="no-referrer"
      />
    )
  } else if (hasText) {
    previewContent = (
      <pre className="break-words whitespace-pre-wrap rounded-md border bg-background p-3 text-xs leading-5">
        {email.text}
      </pre>
    )
  } else {
    previewContent = <EmptyContent message="No preview content is available." />
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Email preview">
      <div className="border-b px-4 py-3">
        <h3 className="truncate text-sm font-semibold">{email.subject}</h3>
        <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
          <div className="min-w-0 truncate">
            <dt className="inline font-medium text-foreground">To: </dt>
            <dd className="inline">{email.to}</dd>
          </div>
          {email.from !== undefined && email.from.length > 0 ? (
            <div className="min-w-0 truncate">
              <dt className="inline font-medium text-foreground">From: </dt>
              <dd className="inline">{email.from}</dd>
            </div>
          ) : null}
          <div>
            <dt className="inline font-medium text-foreground">Received: </dt>
            <dd className="inline">{formatDate(email.createdAt)}</dd>
          </div>
          <div>
            <dt className="inline font-medium text-foreground">Expires: </dt>
            <dd className="inline">{formatDate(email.expiresAt)}</dd>
          </div>
        </dl>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          if (value === 'preview' || value === 'text' || value === 'source') {
            setActiveTab(value)
          }
        }}
        className="flex min-h-0 flex-1 gap-0"
      >
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-2">
          <TabsList variant="line" aria-label="Email content view">
            <TabsTrigger value="preview">Preview</TabsTrigger>
            {hasText ? <TabsTrigger value="text">Text</TabsTrigger> : null}
            {hasRenderedSource ? <TabsTrigger value="source">Source</TabsTrigger> : null}
          </TabsList>
          {email.code === undefined ? null : (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => {
                copyCode().catch(() => {
                  setCopyState('failed')
                })
              }}
            >
              {copyLabel}
            </Button>
          )}
        </div>

        <TabsContent
          value="preview"
          className="min-h-0 flex-none overflow-auto bg-muted/20 p-3 @3xl:flex-1"
        >
          {previewContent}
        </TabsContent>
        {hasText ? (
          <TabsContent
            value="text"
            className="min-h-0 flex-none overflow-auto bg-muted/20 p-3 @3xl:flex-1"
          >
            <pre className="break-words whitespace-pre-wrap rounded-md border bg-background p-3 text-xs leading-5">
              {email.text}
            </pre>
          </TabsContent>
        ) : null}
        {hasRenderedSource ? (
          <TabsContent
            value="source"
            className="min-h-0 flex-none overflow-auto bg-muted/20 p-3 @3xl:flex-1"
          >
            <pre className="break-words whitespace-pre-wrap rounded-md border bg-background p-3 font-mono text-[11px] leading-5">
              {renderedSource}
            </pre>
          </TabsContent>
        ) : null}
      </Tabs>
    </section>
  )
}
