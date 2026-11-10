import { defineHandler } from 'nitro'

import { readEmailInbox } from '../../affect-dev/inbox.server'
import { getAffectDevTarget, privateHeaders } from '../../affect-dev/request-gate.server'

export default defineHandler(({ req }) => {
  if (getAffectDevTarget({ request: req, method: 'GET' }) === null) {
    return new Response(null, { headers: privateHeaders, status: 404 })
  }

  return Response.json({ emails: readEmailInbox() }, { headers: privateHeaders })
})
