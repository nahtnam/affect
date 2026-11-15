// Initialize production settings before evaluating application modules.
if (import.meta.env.PROD) {
  const { useStorage: getServerStorage } = await import('nitro/storage')
  const { loadRuntimeEnvironment } = await import('./runtime-env.server')

  const source = await getServerStorage('assets:affect-profile').getItem<string | Uint8Array>(
    '.env',
  )

  loadRuntimeEnvironment(source)
}

const { default: handler } = await import('./server-handler')

export default handler
