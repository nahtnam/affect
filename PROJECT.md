# Affect

## Product brief

- Users: to be confirmed.
- Buyer: to be confirmed.
- Problem and desired outcome: to be confirmed.
- Core workflow: to be confirmed.
- First useful product outcome: to be confirmed.
- Success evidence: to be confirmed.
- Scope beyond the migrated boilerplate: open.

The public home and authenticated app placeholders are migration baseline behavior, not evidence of a chosen product workflow. Preserve these unknowns until product decisions are supplied.

## Confirmed technical decisions

- The repository is a private Bun workspace. Root tooling and lockfile stay at the repository root; the web app is apps/web; Convex remains at convex/; apps/* and packages/* can grow without placeholder packages.
- The web app uses TanStack Start and TanStack Router with Vite. It remains deployable through the selected adapter; source behavior must not depend on Nitro or Vercel internals unless a task explicitly owns that integration.
- Better Auth is hosted through the Convex Better Auth component. Convex server functions enforce current-session and role authorization independently of route navigation.
- Protected route identity is established on the server before the initial protected response. Identity lookup failure is distinct from confirmed signed-out state. A token 401 alone is ambiguous and cannot authorize a signed-out-only form.
- All frontend Convex application reads use `convex-route-query` for loaders and live subscriptions, backed by the native Convex and TanStack Query integration with isolated request caches. Server-only request authentication uses a fresh native Convex query to verify the current viewer.
- The existing password demo is not the shipped authentication behavior. Preserve email OTP semantics and the shipped public, sign-in, authenticated app and platform-admin routes.
- The accepted baseline includes Affect Dev Email, its local-only guard and privacy-preserving responsive preview. Access it through TanStack Devtools → Plugins → Emails → Load emails. Final native plugin browser acceptance passed at 1280×720 and 390×568 on the frozen source, including touch access to Preview/Text/Source and Copy; see `docs/ui-implementation.md` for scope and evidence limits.
- Effect v4 remains the domain validation/tracing choice in the current working tree. Optional telemetry remains optional and sensitive values stay out of exported data.
- UI baseline: use the self-hosted Geist font and preserve the accessible skip link, auth-aware shell, responsive behavior and placeholders. The current destination components.json is shadcn New York with Tailwind v4 and Lucide; any preset adaptation should be narrow and coordinated with the UI owner, not a broad reset.
- Package pins and source moves are owned by the foundation worker. Current scripts and app integration are subject to that worker's final handoff.

## Setup and runtime status

- Bun 1.4.4 and Node 24.22.2 are pinned through Mise.
- Root scripts currently include dev (Portless), dev:localhost, build, start, preview, typecheck, lint, format, format:check, test, knip, and check. The focused check workflow is the relevant default; broad check is not needed for every edit.
- Encrypted development/preview/production/CI profiles are not present in the current worktree. Do not copy profiles, keys, or project identifiers from the old checkout. The root `.env.example` contains public variable names only. The web env source now uses named public reads, and a synthetic production transform excluded unrelated markers; Vite development still follows its normal `VITE_` convention, so no hard development allowlist is claimed.
- `VITE_SITE_URL` may be blank only for the root Portless development path, where auth reads the advertised `PORTLESS_URL`. Direct loopback and hosted auth require the exact browser origin in `VITE_SITE_URL`, with matching `SITE_URL` and `TRUSTED_ORIGINS` in the selected Convex deployment.
- Affect CLI 0.0.5 profile activation and `affect run` support Vite profile values. `MISE_NO_ENV=1 mise exec -- bunx --no-install affect env sync-dev` uses the development key to verify the exact target and writes only declared server settings; this is a separate remote environment mutation. `affect deploy` requires `VERCEL_ENV=preview|production`, the matching profile/key, and `VERCEL_GIT_COMMIT_REF` for preview. During the native Convex deploy callback, the CLI writes declared settings before the TanStack build and final backend push. Settings can change even if the build fails. It may mutate backend code/schema/indexes and does not publish frontend assets. Resolve and authorize exact targets separately. No app startup sync or automatic deployment exists.
- An isolated hosted development setup was used for app-owner checks, but target identifiers are intentionally not recorded here and current remote state was not rechecked during this docs pass. Production/preview and a frontend host remain undecided. Resolve the exact target from trusted provider evidence before any future remote operation.
- TanStack Intent 0.5.5 is installed at the root with the exact 15-topic `intent.skills` allowlist; its managed guidance block is present in AGENTS.md.
- Owner and independent reviews accepted protected first responses, browser token-failure retry, live updates and cache ownership, native Portless OTP, exact return fragment, role/session loss, and sign-out/replay denial. The native Devtools Emails plugin also passed final desktop and phone visual/lifecycle acceptance; historical dock evidence is separate. Generated Convex output matched the isolated codegen snapshot. Broader route-local states, query-string analytics privacy and hosted exporter lifecycle remain unverified. External email delivery and production-data migration were not authorized or performed.

## Open architecture and product questions

- Which user group, buyer, workflow and measurable result should the product serve?
- Which authorized isolated development deployment and trusted origin should future hosted checks use? Resolve current target state before each remote operation.
- Which host will be selected for deployment? No host or production transition is authorized by this brief.
- The combined Convex + Better Auth TanStack Start guide exists and is the primary integration reference. Its generic token boolean example does not settle this project's stricter distinction between confirmed no session and service failure. Follow the installed Better Auth/component contract and the architecture security preflight; do not assume undocumented APIs.
- Native Portless forwarding, OTP, browser close/focus and provider success/queued/failure policy have scoped runtime or fixture evidence; worker-restart and two-tab behavior remain synthetic-fixture evidence. Real Cloudflare email delivery was not attempted.

## Evidence and lifecycle

Mark a behavior implemented only when it exists in the destination source; mark it verified only with focused current evidence tied to the final source revision. Keep all remaining migration statuses in docs/migration-parity.md. Edit, commit, push, publish, open PR, merge, deploy and remote data mutation are separate transitions. The current task is local only.
