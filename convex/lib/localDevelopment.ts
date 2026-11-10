import { String } from 'effect'

export const isLocalDevelopmentOrigin = (url: URL) =>
  (url.protocol === 'https:' || url.protocol === 'http:') &&
  (url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]' ||
    String.endsWith('.localhost')(url.hostname))
