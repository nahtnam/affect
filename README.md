# Affect

Affect is a product in discovery. The current public home and authenticated app are boilerplate placeholders. See PROJECT.md for confirmed decisions and open questions.

## Workspace

- Root: shared Bun tooling, lockfile, Mise configuration and Convex backend.
- Web: apps/web, a TanStack Start application using Vite.
- Backend: convex/ at the repository root.
- Workspace patterns support future apps/* and packages/* without placeholder packages.

Page routes live under `apps/web/src/routes`. The pathless layouts group `/app` under `_with-user`, `/admin` under `_with-admin`, and `/sign-in` under `_without-user`.

## Setup

Hosted initialization has an explicit entry point:

```sh
bash scripts/setup.sh --hosted --team 11 --project 22 \
  --profiles development,preview,production --site-url https://app.example.com \
  --non-interactive
```

Replace the numeric team/project IDs and public origin with the intended targets. This checkout pins the published Affect CLI 0.0.7. Setup checks exact `affect env init` capability before initialization; older incompatible checkouts stop with a fixed prerequisite error. Fixture checks alone do not establish acceptance against a real hosted account.

That one command installs the toolchain and frozen dependencies before initializing or restoring profiles, so no development ciphertext or private key is required beforehand. Provide separately authorized Convex authentication: an existing native saved login/PAT, `CONVEX_ACCESS_TOKEN`, or an `AFFECT_CONVEX_TOKEN` team token. Noninteractive first use must explicitly select the numeric team, existing project (`--project`) or new project name (`--create-project`), and comma-separated profiles. This setup entry point requires `development` for its final local validation and rejects other selections before provider operations; direct `affect env init` can initialize other profile combinations. `--site-url` is the exact hosted app origin; optional `--dev-deployment` and `--prod-deployment` bind existing deployment names. Optional `--values` supplies a private JSON settings file for external-service inputs. Broad account/team credentials authorize setup only and must never enter encrypted app profiles, host runtime configuration or logs.

The CLI records verified IDs/profile choices without tokens in `affect.json`, stores each matching private key in an ignored owner-only profile keyfile, and uses native Convex custody to make subsequent authorized clones recoverable. Development and production custody belongs to their respective deployments. Preview-family custody uses the project's default environment variables restricted to preview deployments and contains only preview-scoped credentials. Existing keys and production settings are preserved: conflicting or unverifiable values stop initialization instead of triggering rotation or overwrites.

Vercel delivery is optional and requires separate Vercel authentication plus explicit `--vercel-project`, `--vercel-account`, and, for a team account, `--vercel-team`. Convex authorization never authorizes a host account. Matching `DOTENV_PRIVATE_KEY` values are delivered to separate development/preview/production targets. `--configure-host-build` requires host Root Directory `apps/web` and inclusion of source files outside that directory, then adopts `cd ../.. && bunx --no-install affect deploy` only when the existing build command is empty or already matches. Incompatible host build settings fail before provisioning; setup does not change the host root or source inclusion. It does not link Git, select domains or publish the frontend. Existing unreadable host secrets or conflicting values require explicit resolution and are not replaced.

New development profiles default to `http://localhost:3000`; start them with:

```sh
VERCEL_ENV=development bash scripts/mise.sh exec -- bun run dev:localhost
```

Use `--dev-origin` only for a known exact development origin, including an actual advertised Portless origin. Initialization does not invent or broadly trust a Portless hostname. Restored profiles retain their existing origins and can continue using their configured Portless workflow.

For an already provisioned development profile, the default command remains local:

From the repository root, locally or in a cloud setup field:

```sh
bash scripts/setup.sh
```

The default command installs Mise, the pinned Bun 1.4.4 and Node 24.22.2, and frozen workspace dependencies, then verifies the **development** profile. It is noninteractive and repeatable. It requires Bash, curl, standard filesystem/archive utilities, public package/tool download access, provisioned ciphertext at `env/development/.env`, and its matching `DOTENV_PRIVATE_KEY` as an actual environment variable or the existing saved local keyfile. The template contains no encrypted profile; a key alone cannot create one or configure a backend. This default path never invokes hosted initialization.

The development key is saved locally in ignored `env/development/.env.keys` with owner-only permissions, after successful validation. This lets later commands decrypt the profile even when a cloud provider exposes the key only during setup. Treat this local file as a credential: keep the workspace private, exclude it from artifacts, and delete it when retiring the environment. No decrypted profile or other setup secrets are saved. An HTTP proxy secret is a value injected into outbound HTTP requests; it is not process key material and cannot decrypt a profile. Package-download proxy credentials remain provider-owned and must be available again if a later install needs them.

Run ordinary commands through the repository's Mise entry point. It restores the selected native paths before invoking Mise, including in fresh noninteractive shells with a read-only HOME:

```sh
VERCEL_ENV=development bash scripts/mise.sh exec -- bun run dev
VERCEL_ENV=development bash scripts/mise.sh exec -- bun run test -- tests/effect.test.ts
```

Setup preserves HOME and reuses an existing executable Mise when available. It respects explicit native directory settings and selects writable defaults, falling back to ignored `.setup.local` storage in the repository. Native path settings persist as data in owner-only `.setup.local/toolchain.paths`; keys, profile selectors and proxy credentials are excluded. Keep this local state out of exported artifacts. To change a native path, rerun setup with that setting.

Explicit `VERCEL_ENV=development` keeps cloud runners with `CI=true` on the intended development profile. Setup always validates development but does not change native profile selection: `VERCEL_ENV`, then exact `CI=true` / `GITHUB_ACTIONS=true`, otherwise `development`. The stored development key is used only for development and only when no process `DOTENV_PRIVATE_KEY` is supplied. Preview, production and CI require their own matching process key; they never fall back to the saved development key.

`bun run dev` starts only the Portless web app. Use the advertised origin for browser requests and backend auth trust; Portless supplies `PORTLESS_URL`, so `VITE_SITE_URL` may be blank for this mode. For direct loopback, use `bun run dev:localhost` through the same Mise command and set `VITE_SITE_URL` to `http://localhost:3000`. Hosted authentication also requires the exact public origin, with matching `SITE_URL` and `TRUSTED_ORIGINS` in the selected backend. Default setup does not modify those settings, start a Convex watcher, sync, provision or deploy. Explicit `--hosted` authorizes the initialization workflow only; deployment remains a separate transition.

For keyless checks, disable profile directives:

```sh
MISE_NO_ENV=1 bash scripts/mise.sh exec -- bun run test -- tests/effect.test.ts
```

`affect env` prints secret-bearing shell exports; do not log it. Missing profile/key, invalid ciphertext, wrong key or incomplete public origins fail setup with a secret-safe error. Use the repository's normal instructions for subsequent work; there is no generic Start or setup skill to invoke.

## Environment contract

Vite publishes `VITE_` values by default, so treat every such value as public and keep server secrets unprefixed. The web env module now passes five named public values into the app configuration rather than handing the full runtime env object to T3. A synthetic production transform confirmed that unrelated prefixed and unprefixed markers were absent; Vite development still uses its normal prefix behavior, so this is not a hard development allowlist. The root template remains a list of names, not an exposure control.

The browser build requires `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` as HTTP(S) origins. `VITE_SITE_URL` may be blank for the root Portless development command, which supplies `PORTLESS_URL`; direct loopback and hosted authentication require it to be the exact browser origin. `VITE_POSTHOG_HOST` and `VITE_POSTHOG_KEY` are optional public analytics settings; analytics is omitted when the pair is absent or invalid. These variables and the Better Auth browser client do not contain server credentials.

The Convex server declaration requires `BETTER_AUTH_SECRET`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `EMAIL_FROM`, `SITE_URL`, `TRUSTED_ORIGINS`, and `POSTHOG_PROJECT_TOKEN`. The Better Auth secret must be at least 32 characters; `SITE_URL` and each trusted origin must be HTTP(S) origins. An empty PostHog project token disables analytics; `POSTHOG_HOST` is optional. Keep these values unprefixed in the encrypted profile. `DOTENV_PRIVATE_KEY` decrypts the selected profile; `CONVEX_DEPLOY_KEY` identifies a deployment for CLI operations and must remain secret. The profile selector prefers `VERCEL_ENV`, then CI/GitHub Actions, then `development`; preview, production and CI profiles are separate. The template supplies no profiles. The four exact `env/{development,preview,production,ci}/.env` paths may contain provisioned ciphertext; private keys, keyfiles, local dotenv files and other dotenv paths remain ignored.

For Cloudflare email, keep `EMAIL_FROM` as the sender address (for example, `auth@example.com`). Optional server-only `EMAIL_FROM_NAME` sets its display name; an unset or whitespace-only value falls back to the shared `appName` in `app-config.ts`, also used by Better Auth. Delivery uses Cloudflare's native REST `{ address, name }` sender representation, so quotes and Unicode names do not require manual header escaping. Existing `Name <address>` values in `EMAIL_FROM` retain their embedded name and take precedence over `EMAIL_FROM_NAME`; use a bare address to select the new override or app-name fallback. Development capture keeps its existing sender-string format. Put the optional setting in the selected encrypted profile and use the separately authorized native environment-sync/deploy workflow below to apply it; it is not a browser variable and does not require a CLI upgrade. See [Cloudflare named-address examples](https://developers.cloudflare.com/email-service/examples/email-sending/recipients/).

## Production configuration

Provision the selected encrypted `env/<profile>/.env` before building. Profile selection matches the CLI: `VERCEL_ENV`, then `ci` when `CI=true` or `GITHUB_ACTIONS=true`, otherwise `development`. A local app-only production build can use `VERCEL_ENV=production affect run -- bun run build`; this builds artifacts and does not deploy anything. Build-time public configuration still needs the intended origins. Nitro selects the host preset; set `NITRO_PRESET=node-server` explicitly for a generic Node artifact when building with Vercel environment metadata.

The build rejects missing profiles, plaintext values and private-key assignments. It packages only the selected `.env` as a Nitro server asset, including the dotfile explicitly. Other profiles, adjacent files and keyfiles are excluded. Never put profiles in public assets or copy decrypted dotenv files into output.

At cold start, the server reads the bundled ciphertext and decrypts it with native dotenvx before dynamically importing the application handler. The runtime needs only the matching `DOTENV_PRIVATE_KEY` as app configuration; the profile is already inside the server artifact. No runtime profile selector, external env file, CLI process wrapper, plaintext secret transport or Vercel-specific source branch is required. Missing or incorrect keys fail initialization with a fixed error. Development keeps its existing CLI/Mise profile activation.

`convex/env.config.ts` re-exports `publicEnv` from the neutral `convex/envDefinition.ts`. This array lists intentionally browser-safe additions (`VITE_SITE_URL`, `VITE_POSTHOG_HOST`, `VITE_POSTHOG_KEY`); the CLI owns the two canonical Convex URLs. Affect CLI 0.0.7 forwards only these declared additions, never all `VITE_` values or backend declarations. New browser values must be deliberately listed and consumed by the app. Keep server settings unprefixed.

This contract configures the web runtime. Convex backend settings, provider credentials and remote deployment targets still require their own explicit setup and authorization.

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
- `MISE_NO_ENV=1 bash scripts/mise.sh exec -- bunx --no-install affect env sync-dev` reads the development profile directly, verifies its development-scoped key against deployment identity and canonical `VITE_CONVEX_URL` / `VITE_CONVEX_SITE_URL` values, then writes only present settings declared by `convex/env.config.ts`. Provide the matching development `DOTENV_PRIVATE_KEY`. This is a remote environment mutation, not a code deployment: resolve and authorize the exact team, project and development deployment separately. Never run it automatically at app startup.
- `bash scripts/mise.sh exec -- bunx --no-install affect deploy` requires `VERCEL_ENV=preview` or `production`, the matching encrypted profile and key, and `VERCEL_GIT_COMMIT_REF` for preview. During the native Convex deploy callback, the CLI writes declared settings before the TanStack build and final backend push. Settings can change even if the build fails. The command may push Convex functions, schema and indexes; it does not publish frontend assets. Resolve and authorize the exact target separately. Do not use it as local setup or add `NEXT_PUBLIC_*` aliases.

There is no repository deploy script or selected frontend host. Optional host configuration during explicit hosted initialization is separate from frontend publication and backend deployment.

## Backend and frontend deployment

No root deploy script or reusable provider target is configured in the checked-in workspace. An isolated hosted development deployment was used for owner-reported checks, but its current state is not reverified here. No deployment authorization is implied. Do not run deployment commands as local setup.

The native Convex pattern `bunx --no-install convex deploy --cmd 'bun run build'` runs the web build as part of a backend deployment. The pinned Convex CLI detects Vite/TanStack from the root manifest and supplies both `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` to the build command; this behavior was confirmed by installed-source inspection, not by running a deploy. The command can push Convex functions, schema and indexes to the selected deployment; it does not publish frontend assets to a hosting provider. Target resolution can select the project's default production deployment when `CONVEX_DEPLOYMENT` is set. Before any use, resolve the exact account/team, project, deployment and environment, then confirm the task authorizes that write. This documented native pattern is not a configured script or approved deployment plan.

Affect's app consumes `VITE_CONVEX_SITE_URL` for Better Auth. Convex's installed Vite/TanStack detection supplies both public URLs to the child build. The frontend host and publish step remain undecided. During the native Convex deploy callback, Affect CLI 0.0.7 writes the selected preview/production profile's declared settings before the TanStack build and final backend push. A build failure does not roll back that environment write; backend deployment and environment configuration require exact-target authorization. The CLI does not publish frontend assets.

For previews, the CLI resolves the frontend origin from `VERCEL_URL` or an explicit `AFFECT_PREVIEW_ORIGIN` and uses the native branch deployment’s canonical Convex URLs. It applies the same origins to backend authentication, the browser build and a temporary encrypted runtime profile using the existing preview key. Deployment/provider controls stay out of that runtime payload; the committed profile is restored after the build. Native branch deployments are created or reused without resetting data.

## Development references

- [Mise installation and pinned installer options](https://mise.jdx.dev/installing-mise.html)
- [Mise native directory settings](https://mise.jdx.dev/directories.html)
- [Mise environment directives and keyless execution](https://mise.jdx.dev/environments/)
- [dotenvx private key files](https://trust.dotenvx.com/docs/env-keys-file)
- TanStack Start: https://tanstack.com/start/latest
- Convex + Better Auth + TanStack Start: https://labs.convex.dev/better-auth/framework-guides/tanstack-start
- Convex + TanStack Query: https://docs.convex.dev/client/tanstack/tanstack-query
- Native Convex deploy command and target selection: https://docs.convex.dev/cli/reference/deploy
- Convex environment settings: https://docs.convex.dev/production/environment-variables
- TanStack Intent setup: https://tanstack.com/intent/latest/docs/getting-started/quick-start-consumers

The combined integration guide is a starting point. This project additionally requires confirmed absence of a session to be distinguished from service/adapter failure; a token 401 by itself is ambiguous.

## Run locally without secrets

Run `bash scripts/setup.sh --local` once per checkout while online. From any fresh shell in
that checkout, use the pinned tools with dotenv loading disabled:

```sh
local_app() { MISE_NO_ENV=1 bash scripts/mise.sh exec -- bun --no-env-file run "local:$@"; }
local_app start --seed   # prints URL=<origin> when ready
local_app seed           # safe to repeat; customize convex/seed.ts
local_app code           # gets a fresh Better Auth code for demo@example.test
```

Open the printed URL. In that page’s browser console run the following and enter
the code at the prompt. Browser automation can run the same fetch in page context
with the code supplied as an argument. The local command uses the internal email
capture action. Better Auth verifies the OTP and sets the browser session cookie.

```js
const response = await fetch('/api/auth/sign-in/email-otp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'demo@example.test', otp: prompt('Local sign-in code') }),
})
if (response.ok) location.assign('/app')
```

`local_app stop` preserves data. `local_app reset` stops the instance and
erases its local application data. Run `local_app start` without `--seed` for an
empty app after reset. Each checkout has its own ports and state in `.setup.local/`.

Convex [anonymous mode](https://docs.convex.dev/cli/agent-mode) downloads the backend and
stores its database in the CLI project's `.convex/local/default/`. Affect keeps that project
under `.setup.local/anonymous/` so an existing hosted profile cannot select the target.
Setup downloads the CLI-selected backend and dashboard into the toolchain’s writable XDG cache, shared
across checkouts. If the toolchain falls back to checkout storage, the backend uses an
owner-only cache in the system temporary directory. Start, seed, and reset work offline.
Reset keeps the checkout’s CLI identity so Convex can reopen an empty database offline.
Vite inherits the URLs selected by Convex. The launcher chooses a free web port and gives
each checkout a distinct localhost hostname to isolate browser cookies. It pipes local settings
through [convex env set](https://docs.convex.dev/cli/reference/env) and starts Vite with
[convex dev --start](https://docs.convex.dev/cli/reference/dev).

The seed is an ordinary internal mutation invoked by `convex run seed:populate`.
Convex also supports `dev --run` at startup, [file imports](https://docs.convex.dev/database/import-export/import),
and [deploy --preview-run](https://docs.convex.dev/production/multiple-deployments) on preview creation.
