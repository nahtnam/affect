import DOMPurify from 'dompurify'

const previewPolicy = {
  FORBID_ATTR: ['action', 'background', 'formaction', 'href', 'src', 'srcset'],
  FORBID_TAGS: ['base', 'embed', 'form', 'iframe', 'link', 'meta', 'object'],
  USE_PROFILES: { html: true },
}

export const createEmailPreviewDocument = (html: string) => {
  const content = DOMPurify.isSupported ? DOMPurify.sanitize(html, previewPolicy) : ''

  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; child-src 'none'; connect-src 'none'; font-src 'none'; form-action 'none'; frame-src 'none'; img-src 'none'; media-src 'none'; object-src 'none'; script-src 'none'; style-src 'unsafe-inline'"></head><body>${content}</body></html>`
}
