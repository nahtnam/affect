import { defineHandler } from 'nitro'

import { developmentTargetAvailable, runBridge } from '../../affect-dev/bridge.server'
import { getAffectDevTarget, privateHeaders } from '../../affect-dev/request-gate.server'

const unavailable = () => new Response(null, { headers: privateHeaders, status: 404 })

export default defineHandler(({ req }) => {
  const target = getAffectDevTarget({ request: req, method: 'GET' })

  if (target === null) {
    return unavailable()
  }

  return runBridge(developmentTargetAvailable(target)).then((available) =>
    available ? Response.json({ available: true }, { headers: privateHeaders }) : unavailable(),
  )
})
