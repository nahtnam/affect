import {
  createCsrfMiddleware,
  createMiddleware,
  createServerOnlyFn,
  createStart,
} from '@tanstack/react-start'

import { authOrigin } from '#/auth/auth-origin.server'
import { privateHeaders } from '#/auth/private-headers'

const privateDocuments = /^\/(?:app|admin|sign-in)\/*$/iu

const preventPrivateDocumentCaching = createMiddleware().server(async ({ next, request }) => {
  // TanStack Start's middleware callback must await the framework continuation.
  const continuation = next
  const result = await continuation()

  if (!privateDocuments.test(new URL(request.url).pathname)) {
    return result
  }

  // This also covers canonical URL redirects before the route guard runs.
  const headers = new Headers(result.response.headers)
  headers.set('Cache-Control', privateHeaders['Cache-Control'])

  return {
    ...result,
    response: new Response(result.response.body, {
      headers,
      status: result.response.status,
      statusText: result.response.statusText,
    }),
  }
})

export const startInstance = createStart(() => ({
  requestMiddleware: [
    createCsrfMiddleware({
      filter: ({ handlerType }) => handlerType === 'serverFn',
      origin: createServerOnlyFn((value: string) => value === authOrigin()),
    }),
    preventPrivateDocumentCaching,
  ],
}))
