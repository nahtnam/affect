import { TanStackDevtools } from '@tanstack/react-devtools'
import type { TanStackDevtoolsReactPlugin } from '@tanstack/react-devtools'

import { destroyAffectEmailsPanel, EmailsPanel } from '#/affect-dev/emails-panel'

export const affectEmailsPlugin: TanStackDevtoolsReactPlugin = {
  id: 'affect-emails',
  name: 'Emails',
  render: (mount) => <EmailsPanel mount={mount} />,
  destroy: (pluginId) => {
    if (pluginId === 'affect-emails') {
      destroyAffectEmailsPanel()
    }
  },
}

const plugins = [affectEmailsPlugin]

export const Devtools = () => (
  <TanStackDevtools
    eventBusConfig={{ connectToServerBus: false, debug: false }}
    plugins={plugins}
  />
)
