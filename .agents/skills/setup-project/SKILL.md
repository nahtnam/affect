---
name: setup-project
description: Set up or resume this Affect workspace's local toolchain and environment profiles; use for repository setup, not routine feature work or remote deployment.
---

# Affect local setup

Work from the repository root. Read PROJECT.md and AGENTS.md first. Inspect the current worktree and actual package scripts before acting.

## Local toolchain

- From a fresh noninteractive shell, first install Mise using its official installation instructions and record its version. At the repository root, run `mise trust mise.toml`, `MISE_NO_ENV=1 mise install`, then `MISE_NO_ENV=1 mise exec -- bun install --frozen-lockfile`. `MISE_NO_ENV=1` keeps project environment directives out of these bootstrap commands.
- Encrypted profiles are not included in the checked-in template. Provision the required ciphertext through the task-approved path and place it at `env/development/.env`, or `env/<profile>/.env` for another selected profile; a decryption key alone cannot create profile ciphertext or configure a backend. For a clean development launch, unset inherited `VERCEL_ENV`, `CI`, and `GITHUB_ACTIONS` unless another profile is intentional; selection prefers `VERCEL_ENV`, then CI/GitHub Actions, then `development`.
- Root `mise exec -- bun run dev` is the Portless path. Use its advertised origin as the browser origin. Plain `bun run dev` is appropriate only when the shell is already activated.
- `mise exec -- bun run dev:localhost` is a direct loopback fallback on `http://localhost:3000`, a different origin from Portless. Set `VITE_SITE_URL` to that exact origin and ensure the selected Convex deployment's `SITE_URL` and `TRUSTED_ORIGINS` accept it before using sign-in. Hosted authentication also requires `VITE_SITE_URL` to match the exact public origin at build time, and backend auth origins to match it.
- In Vite development, auth uses the Portless-provided `PORTLESS_URL` when present. Therefore `VITE_SITE_URL` may be blank only for the root Portless development launch; it is required for direct loopback and hosted authentication.
- For a keyless local equivalent of CI, run `MISE_NO_ENV=1 mise exec -- bun run check` with no app profile key or values. This does not make the tool/dependency download phase offline.
- Starting the web server does not start Convex, deploy functions, sync remote environment values, or select a hosted target.
- Use the current package scripts as documented by package.json. Do not assume commands from the old Next project or a starter README still exist.

## Environment profiles

Encrypted profiles are not part of the checked-in template. Do not copy old profile ciphertext, keys, provider identifiers, or target URLs into this checkout. Obtain required values through the task's approved path and keep them out of logs and generated docs. The safe name-only template is the root `.env.example`; it is not an encrypted profile or complete target configuration.

Affect CLI 0.0.5 `env` and `run` can decrypt the selected profile and provide its Vite values to a command. Prefer `mise exec -- bunx --no-install affect run -- <command>` to scope profile values to one child process. Selection is `VERCEL_ENV`, then CI/GitHub Actions, then `development`; keep preview, production and CI profiles separate. Treat `affect env` output as secret-bearing. Use only the matching `DOTENV_PRIVATE_KEY` in the process that needs it. Vite exposes `VITE_` values by default, particularly in development. The web env source now uses five explicit named public reads and the synthetic production transform excluded unrelated markers; this is not a hard development allowlist. Keep Better Auth secrets, deploy keys, Cloudflare credentials and other server values unprefixed. Avoid secret-bearing `.env.*` files; Vite and Nitro load mode-specific dotenv files, so verify ignore coverage before adding any local dotenv file.

The public build requires `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` as origins. `VITE_SITE_URL` may be omitted only for root Portless development, where `PORTLESS_URL` supplies the auth origin; direct loopback and hosted authentication require the exact site origin in `VITE_SITE_URL`. The selected Convex deployment must accept the same origin in `SITE_URL` and `TRUSTED_ORIGINS`. `VITE_POSTHOG_HOST` and `VITE_POSTHOG_KEY` are optional public analytics settings. The Convex server declaration requires `BETTER_AUTH_SECRET`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `EMAIL_FROM`, `SITE_URL`, `TRUSTED_ORIGINS`, and `POSTHOG_PROJECT_TOKEN`; the PostHog token may be empty to disable analytics and `POSTHOG_HOST` is optional. Keep all server values unprefixed and out of the browser build.

Run development sync with `MISE_NO_ENV=1 mise exec -- bunx --no-install affect env sync-dev` and the matching development `DOTENV_PRIVATE_KEY`. This makes the CLI read the development profile directly rather than inheriting an ambient preview or production profile. It verifies the development-scoped key, deployment identity and canonical `VITE_CONVEX_URL` / `VITE_CONVEX_SITE_URL`, then writes only present settings declared by `convex/env.config.ts`. This is a remote environment mutation, not a code deployment; resolve and authorize the exact development target before use. `affect deploy` requires `VERCEL_ENV=preview|production`, the matching encrypted profile/key, and `VERCEL_GIT_COMMIT_REF` for preview. During the native Convex deploy callback, the CLI writes declared settings before the TanStack build and final backend push; later build/deploy failure does not roll back those environment changes. It may push backend functions, schema and indexes and does not publish frontend assets. Treat it as a separate authorized backend deployment. Neither command runs automatically at app startup. Do not add Next-public aliases or local compatibility wrappers.

For backend settings, Convex provides native env list/get/set operations, and its declaration validators can block invalid values. Use native CLI commands only after the exact account/team, project, deployment and environment are confirmed and the task authorizes that write. Prefer a protected file input for secret values; do not place secrets in shell arguments or reports. A credential identifies a target but is not authorization.

Native convex dev watches files and can push changes to a selected development deployment. Do not start it for app-only work or as part of web startup. Native codegen writes local generated output; check the installed Convex version and resolve the required target context first because this project has Convex component discovery behavior. Never hand-edit generated files.

## Boundaries

- The pinned Convex 1.49 CLI detects Vite/TanStack from the root manifest and supplies both `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` to the build command in its native `deploy --cmd` flow; this was established by installed-source inspection, not by running deploy. It can push backend functions/schema/indexes and may resolve to default production when `CONVEX_DEPLOYMENT` is set. Treat it as a separate authorized backend write after verifying the effective target. It builds but does not publish frontend output. Do not present it as an Affect deploy script or selected host workflow.
- Keep read-only target inspection separate from environment changes, codegen, deployment, publishing and data writes.
- Stop before provisioning, retargeting, preview/production changes, destructive actions, or data migrations unless the task specifically authorizes them.
- Preserve existing populated data and compatible schema evolution.
- Record unknown targets and missing profile prerequisites as pending. Do not infer account or deployment identity from local file names.
