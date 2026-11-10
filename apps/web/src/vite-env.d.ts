interface ViteTypeOptions {
  strictImportMetaEnv: unknown
}

interface ImportMetaEnv {
  readonly VITE_CONVEX_URL?: string
  readonly VITE_CONVEX_SITE_URL?: string
  readonly VITE_SITE_URL?: string
  readonly VITE_POSTHOG_HOST?: string
  readonly VITE_POSTHOG_KEY?: string
}
