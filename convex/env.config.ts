// Keep the Affect CLI entry point while Convex 1.49.0 treats imported
// ".config." filenames as component definitions during discovery.
import settings from './envDefinition'

export { publicEnv } from './envDefinition'

// Only a verified preview deployment may receive the inbox credential via Affect CLI.
const {
  PREVIEW_INBOX_SECRET: _previewSecret,
  PREVIEW_INBOX_CLOUD_URL: _previewUrl,
  ...standardSettings
} = settings

declare const process: { env: { VERCEL_ENV?: string } }

export default process.env.VERCEL_ENV === 'preview' ? settings : standardSettings

// The deploy callback calls this only after Convex confirms the deployment is a preview.
export const preparePreviewSettings = ({ secret, cloud }: { secret?: string; cloud: string }) => {
  if (secret !== undefined && secret.length < 32) {
    throw new Error('PREVIEW_INBOX_SECRET must contain at least 32 random characters.')
  }

  // Clear any previous binding when a site disables the inbox on a reused branch.
  return { PREVIEW_INBOX_CLOUD_URL: secret === undefined ? '' : cloud }
}
