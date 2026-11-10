# Affect

Affect is a product in discovery. The current public home and authenticated app are boilerplate placeholders. See PROJECT.md for confirmed decisions and open questions.

## Workspace

- Root: shared Bun tooling, lockfile, Mise configuration and Convex backend.
- Web: apps/web, a TanStack Start application using Vite.
- Backend: convex/ at the repository root.
- Workspace patterns support future apps/* and packages/* without placeholder packages.

## Local setup

Use Bun 1.4.4 and Node 24.22.2 via Mise.

From a fresh noninteractive shell at the repository root:

1. Install Mise using its [official instructions](https://mise.jdx.dev/installing-mise.html). Mise is the bootstrap prerequisite; record the installed version.
2. Trust the project config and install the pinned tools without loading project environment directives:

   ```sh
   mise trust mise.toml
   MISE_NO_ENV=1 mise install
   ```

3. Install the frozen workspace dependencies with the pinned Bun, still without loading project environment directives:

   ```sh
   MISE_NO_ENV=1 mise exec -- bun install --frozen-lockfile
   ```

4. Provision encrypted profile ciphertext through the task-approved path and place it at `env/development/.env`; for another selected profile, use `env/<profile>/.env`. This checkout intentionally contains no encrypted profiles. Supply only the matching `DOTENV_PRIVATE_KEY` to the command that needs it. The root `.env.example` lists variable names only; it is not a profile or target configuration. Do not copy old profiles or keys, and do not print `affect env` output. For a clean development launch, unset inherited `VERCEL_ENV`, `CI`, and `GITHUB_ACTIONS` unless you deliberately intend another profile; profile selection prefers `VERCEL_ENV`, then CI/GitHub Actions, then `development`.
5. Start the Portless development app through Mise:

   ```sh
   mise exec -- bun run dev
   ```

   Mise loads the selected profile through the installed Affect CLI activation script for this command. This starts the web app only; it does not start a Convex watcher or synchronize backend settings. Use the advertised origin for browser requests and backend auth trust. In Vite development, Portless provides the origin through `PORTLESS_URL`, so `VITE_SITE_URL` may be blank for this launch mode.

   For direct loopback instead, run `mise exec -- bun run dev:localhost` and set `VITE_SITE_URL` to the exact origin `http://localhost:3000` in the selected profile. Hosted authentication also requires `VITE_SITE_URL` to equal the exact public origin, including scheme and port if present. In these modes, the selected Convex deployment's `SITE_URL` and `TRUSTED_ORIGINS` must accept that same origin. Keep each browser origin and its backend auth configuration aligned.

For another command that needs the selected profile without loading it into the shell, run `mise exec -- bunx --no-install affect run -- <command>`. `affect env` prints shell exports and its output contains secrets. App startup does not synchronize backend settings or deploy code; those are separate operations described under Convex operations.

For the local keyless equivalent of CI, run the quality gate with profile-loading directives disabled and no app key:

```sh
MISE_NO_ENV=1 mise exec -- bun run check
```

This is keyless, not offline: a clean tool and package install requires network access. Starting the web server does not start Convex, provision settings, or sync remote state. Do not copy old encrypted profiles or keys. Missing profile values and hosted targets are prerequisites to resolve, not guessed defaults.

## Environment contract

Vite publishes `VITE_` values by default, so treat every such value as public and keep server secrets unprefixed. The web env module now passes five named public values into the app configuration rather than handing the full runtime env object to T3. A synthetic production transform confirmed that unrelated prefixed and unprefixed markers were absent; Vite development still uses its normal prefix behavior, so this is not a hard development allowlist. The root template remains a list of names, not an exposure control.

The browser build requires `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` as HTTP(S) origins. `VITE_SITE_URL` may be blank for the root Portless development command, which supplies `PORTLESS_URL`; direct loopback and hosted authentication require it to be the exact browser origin. `VITE_POSTHOG_HOST` and `VITE_POSTHOG_KEY` are optional public analytics settings; analytics is omitted when the pair is absent or invalid. These variables and the Better Auth browser client do not contain server credentials.

The Convex server declaration requires `BETTER_AUTH_SECRET`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `EMAIL_FROM`, `SITE_URL`, `TRUSTED_ORIGINS`, and `POSTHOG_PROJECT_TOKEN`. The Better Auth secret must be at least 32 characters; `SITE_URL` and each trusted origin must be HTTP(S) origins. An empty PostHog project token disables analytics; `POSTHOG_HOST` is optional. Keep these values unprefixed in the encrypted profile. `DOTENV_PRIVATE_KEY` decrypts the selected profile; `CONVEX_DEPLOY_KEY` identifies a deployment for CLI operations and must remain secret. The profile selector prefers `VERCEL_ENV`, then CI/GitHub Actions, then `development`; preview, production and CI profiles are separate. No profile ciphertext, keys, or target values are checked in.

## Current root commands

- bun run dev: Portless front door for the web app.
- bun run dev:localhost: direct loopback web server.
- bun run build, bun run start, bun run preview: app build and runtime commands.
- bun run typecheck: root, Convex and web type checks.
- bun run test: Vitest tests.
- bun run lint, bun run format:check, bun run knip: focused quality tools.
- bun run check: sequential broad quality pipeline used by CI.

For ordinary changes, use the focused adjacent test(s) and necessary typecheck; a full check/build is not the default.

## Convex operations

A Convex watcher or command may affect remote state. Before running one, resolve the exact account/team, project, deployment and development/preview/production environment, then confirm the task authorizes that action.

- Native bunx --no-install convex dev watches functions and can push them to the selected development deployment. It is not part of frontend startup.
- Native `bunx --no-install convex codegen` writes generated files locally. It does not deploy running functions, but this project's component discovery may need a verified development target context. Never hand-edit `convex/_generated`.
- Native Convex env list/get/set supports backend settings. Use only for an authorized exact target and preserve secrets in protected inputs rather than shell arguments.
- `MISE_NO_ENV=1 mise exec -- bunx --no-install affect env sync-dev` reads the development profile directly, verifies its development-scoped key against deployment identity and canonical `VITE_CONVEX_URL` / `VITE_CONVEX_SITE_URL` values, then writes only present settings declared by `convex/env.config.ts`. Provide the matching development `DOTENV_PRIVATE_KEY`. This is a remote environment mutation, not a code deployment: resolve and authorize the exact team, project and development deployment separately. Never run it automatically at app startup.
- `mise exec -- bunx --no-install affect deploy` requires `VERCEL_ENV=preview` or `production`, the matching encrypted profile and key, and `VERCEL_GIT_COMMIT_REF` for preview. During the native Convex deploy callback, the CLI writes declared settings before the TanStack build and final backend push. Settings can change even if the build fails. The command may push Convex functions, schema and indexes; it does not publish frontend assets. Resolve and authorize the exact target separately. Do not use it as local setup or add `NEXT_PUBLIC_*` aliases.

There is no repository deploy script or selected frontend host. Hosting and deployment remain separate from local setup.

## Backend and frontend deployment

No root deploy script or reusable provider target is configured in the checked-in workspace. An isolated hosted development deployment was used for owner-reported checks, but its current state is not reverified here. No deployment authorization is implied. Do not run deployment commands as local setup.

The native Convex pattern `bunx --no-install convex deploy --cmd 'bun run build'` runs the web build as part of a backend deployment. The pinned Convex CLI detects Vite/TanStack from the root manifest and supplies both `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` to the build command; this behavior was confirmed by installed-source inspection, not by running a deploy. The command can push Convex functions, schema and indexes to the selected deployment; it does not publish frontend assets to a hosting provider. Target resolution can select the project's default production deployment when `CONVEX_DEPLOYMENT` is set. Before any use, resolve the exact account/team, project, deployment and environment, then confirm the task authorizes that write. This documented native pattern is not a configured script or approved deployment plan.

Affect's app consumes `VITE_CONVEX_SITE_URL` for Better Auth. Convex's installed Vite/TanStack detection supplies both public URLs to the child build. The frontend host and publish step remain undecided. During the native Convex deploy callback, Affect CLI 0.0.5 writes the selected preview/production profile's declared settings before the TanStack build and final backend push. A build failure does not roll back that environment write; backend deployment and environment configuration require exact-target authorization. The CLI does not publish frontend assets.

## Development references

- TanStack Start: https://tanstack.com/start/latest
- Convex + Better Auth + TanStack Start: https://labs.convex.dev/better-auth/framework-guides/tanstack-start
- Convex + TanStack Query: https://docs.convex.dev/client/tanstack/tanstack-query
- Native Convex deploy command and target selection: https://docs.convex.dev/cli/reference/deploy
- Convex environment settings: https://docs.convex.dev/production/environment-variables
- TanStack Intent setup: https://tanstack.com/intent/latest/docs/getting-started/quick-start-consumers

The combined integration guide is a starting point. This project additionally requires confirmed absence of a session to be distinguished from service/adapter failure; a token 401 by itself is ambiguous.
