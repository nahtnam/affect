// Keep the Affect CLI entry point while Convex 1.49.0 treats imported
// ".config." filenames as component definitions during discovery.
import { v } from 'convex/values'
import settings from './envDefinition'

export { publicEnv } from './envDefinition'

// Only a verified preview deployment may receive the inbox credential via Affect CLI.
const { PREVIEW_INBOX_SECRET: _previewSecret, ...standardSettings } = settings
declare const process: { env: { VERCEL_ENV?: string } }

export default process.env.VERCEL_ENV === 'preview'
  ? { ...standardSettings, PREVIEW_INBOX_SECRET: v.string() }
  : standardSettings
