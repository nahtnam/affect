<!-- intent-skills:start -->

# TanStack Intent - before editing files, run the matching guidance command.

tanstackIntent:

- id: "@tanstack/react-router#compositions/router-query"
  run: "bunx --no-install --package @tanstack/intent intent load @tanstack/react-router#compositions/router-query"
  for: "Integrating TanStack Router with TanStack Query: queryClient in router context, static queries and fire-and-forget queries in loaders, useSuspenseQuery in components, defaultPreloadStaleTime: 0, setupRouterSsrQueryIntegration for SSR dehydration/hydration and streaming, per-request QueryClient isolation."
- id: "@tanstack/react-router#react-router"
  run: "bunx --no-install --package @tanstack/intent intent load @tanstack/react-router#react-router"
  for: "React bindings for TanStack Router: RouterProvider, useRouter, useRouterState, useMatch, useMatches, useLocation, useSearch, useParams, useNavigate, useLoaderData, useLoaderDeps, useRouteContext, useBlocker, useCanGoBack, Link, Navigate, Outlet, CatchBoundary, ErrorComponent. React-specific patterns for hooks, providers, SSR hydration, and createLink with forwardRef."
- id: "@tanstack/react-start#lifecycle/migrate-from-nextjs"
  run: "bunx --no-install --package @tanstack/intent intent load @tanstack/react-start#lifecycle/migrate-from-nextjs"
  for: "Step-by-step migration from Next.js App Router to TanStack Start: route definition conversion, API mapping, server function conversion from Server Actions, middleware conversion, data fetching pattern changes."
- id: "@tanstack/react-start#react-start"
  run: "bunx --no-install --package @tanstack/intent intent load @tanstack/react-start#react-start"
  for: "React bindings for TanStack Start: createStart, StartClient, StartServer, React-specific imports, re-exports from @tanstack/react-router, full project setup with React, useServerFn hook."
- id: "@tanstack/router-core#router-core"
  run: "bunx --no-install --package @tanstack/intent intent load @tanstack/router-core#router-core"
  for: "Framework-agnostic core concepts for TanStack Router: route trees, createRouter, createRoute, createRootRoute, createRootRouteWithContext, addChildren, Register type declaration, route matching, route sorting, file naming conventions. Entry point for all router skills."
- id: "@tanstack/router-core#router-core/auth-and-guards"
  run: "bunx --no-install --package @tanstack/intent intent load @tanstack/router-core#router-core/auth-and-guards"
  for: "Route protection with beforeLoad, redirect()/throw redirect(), isRedirect helper, authenticated layout routes (_authenticated), non-redirect auth (inline login), RBAC with roles and permissions, auth provider integration (Auth0, Clerk, Supabase), router context for auth state."
- id: "@tanstack/router-core#router-core/data-loading"
  run: "bunx --no-install --package @tanstack/intent intent load @tanstack/router-core#router-core/data-loading"
  for: "Route loader option, loaderDeps for cache keys, staleTime/gcTime/ defaultPreloadStaleTime SWR caching, pendingComponent/pendingMs/ pendingMinMs, errorComponent/onError/onCatch, beforeLoad, router context and createRootRouteWithContext DI pattern, router.invalidate, Await component, deferred data loading with unawaited promises."
- id: "@tanstack/router-core#router-core/search-params"
  run: "bunx --no-install --package @tanstack/intent intent load @tanstack/router-core#router-core/search-params"
  for: "validateSearch, search param validation with Zod/Valibot/ArkType adapters, fallback(), search middlewares (retainSearchParams, stripSearchParams), custom serialization (parseSearch, stringifySearch), search param inheritance, loaderDeps for cache keys, reading and writing search params."
- id: "@tanstack/router-core#router-core/ssr"
  run: "bunx --no-install --package @tanstack/intent intent load @tanstack/router-core#router-core/ssr"
  for: "Non-streaming and streaming SSR, RouterClient/RouterServer, renderRouterToString/renderRouterToStream, createRequestHandler, defaultRenderHandler/defaultStreamHandler, HeadContent/Scripts components, head route option (meta/links/styles/scripts), ScriptOnce, automatic loader dehydration/hydration, memory history on server, data serialization, document head management."
- id: "@tanstack/router-core#router-core/type-safety"
  run: "bunx --no-install --package @tanstack/intent intent load @tanstack/router-core#router-core/type-safety"
  for: "Full type inference philosophy (never cast, never annotate inferred values), Register module declaration, from narrowing on hooks and Link, strict:false for shared components, getRouteApi for code-split typed access, addChildren with object syntax for TS perf, LinkProps and ValidateLinkOptions type utilities, as const satisfies pattern."
- id: "@tanstack/start-client-core#start-core"
  run: "bunx --no-install --package @tanstack/intent intent load @tanstack/start-client-core#start-core"
  for: "Core overview for TanStack Start: tanstackStart() Vite plugin, getRouter() factory, root route document shell (HeadContent, Scripts, Outlet), client/server entry points, routeTree.gen.ts, tsconfig configuration. Entry point for all Start skills."
- id: "@tanstack/start-client-core#start-core/deployment"
  run: "bunx --no-install --package @tanstack/intent intent load @tanstack/start-client-core#start-core/deployment"
  for: "Deploy to Cloudflare Workers, Netlify, Vercel, Node.js/Docker, Bun, Railway. Selective SSR (ssr option per route), SPA mode, static prerendering, ISR with Cache-Control headers, SEO and head management."
- id: "@tanstack/start-client-core#start-core/middleware"
  run: "bunx --no-install --package @tanstack/intent intent load @tanstack/start-client-core#start-core/middleware"
  for: "createMiddleware, request middleware (.server only), server function middleware (.client + .server), context passing via next({ context }), sendContext for client-server transfer, global middleware via createStart in src/start.ts, middleware factories, method order enforcement, fetch override precedence."
- id: "@tanstack/start-client-core#start-core/server-functions"
  run: "bunx --no-install --package @tanstack/intent intent load @tanstack/start-client-core#start-core/server-functions"
  for: "createServerFn (GET/POST), validator (Zod or function), useServerFn hook, server context utilities (getRequest, getRequestHeader, setResponseHeader, setResponseStatus), error handling (throw errors, redirect, notFound), streaming, FormData handling, file organization (.functions.ts, .server.ts)."
- id: "@tanstack/start-client-core#start-core/server-routes"
  run: "bunx --no-install --package @tanstack/intent intent load @tanstack/start-client-core#start-core/server-routes"
  for: "Server-side API endpoints using the server property on createFileRoute, HTTP method handlers (GET, POST, PUT, DELETE), createHandlers for per-handler middleware, handler context (request, params, context), request body parsing, response helpers, file naming for API routes."

<!-- intent-skills:end -->

# Affect project instructions

Read this file and PROJECT.md before product work. The product, buyer, workflow and success criteria remain open questions unless PROJECT.md or the task confirms them. Preserve the existing workspace and all user changes.

## Ownership and structure

- This is a private Bun workspace. Run workspace commands from the repository root. Root package.json owns shared tools and scripts; apps/web owns the Vite/TanStack app; convex/ remains at root; future apps and packages may use the declared workspace patterns.
- Keep app source under apps/web/src and the web package root at apps/web. Do not move Convex or create placeholder workspaces.
- Root package scripts are the current command contract. Check them before referring to a script. Do not invent env-sync, deploy, route-generation, setup, or browser scripts.
- Read apps/web/vite.config.ts before changing server behavior. The app is Nitro-agnostic; do not make source behavior depend on a Vercel adapter.
- .cursorrules is a compatibility pointer to this file, not a second policy source.

## Skill routing

Use the narrowest applicable project skill:

- Initial local setup and environment profiles: .agents/skills/setup-project/SKILL.md.
- A requested complete user-visible feature or migration slice: .agents/skills/software-factory/SKILL.md.
- Requested or material runtime/browser evidence for UI, navigation, or auth flows: .agents/skills/tanstack-dev-loop/SKILL.md.
- A reproducible generated-output failure only: .agents/skills/tanstack-generation-diagnosis/SKILL.md.
- For Better Auth configuration and session work, use the [Better Auth skill installation guide](https://better-auth.com/docs/ai-resources/skills) and the [Convex + Better Auth TanStack Start guide](https://labs.convex.dev/better-auth/framework-guides/tanstack-start).
- Convex implementation, review, or tests: the corresponding convex-expert, convex-reviewer, or convex-test skill.
- Effect domain/schema work: effect-ts. Use installed Effect 4 guidance; do not install or upgrade packages because the upstream skill examples say to.
- shadcn component or preset work: shadcn. Preserve the configured preset and use the project package manager.
- TanStack Start, Router and Query: use package-bundled skills from the installed dependency version. Root `@tanstack/intent` 0.5.5 is configured with the exact 15-topic `intent.skills` allowlist; the managed mapping above is generated and owned by Intent. Preserve it and do not broaden it. For project-authored guidance, edit only the prose below the managed block; do not copy or edit vendor skills.
- Upstream skill provenance and source hashes are recorded in .agents/skills/provenance.json. Preserve upstream files unchanged. Project rules here override generic skill examples where they differ.

## Current framework and routing

- Use TanStack Start server functions/routes for server-only operations, and TanStack Router file routes, inferred route types, loaders, validated search params and route boundaries. Do not use Next APIs, directives, route conventions, cache APIs, or generated-type commands.
- Loaders are isomorphic unless a server-only boundary is used. Keep secrets, request cookies and server-only SDK calls behind the correct server boundary.
- Use native route and search types. Fix the source of a type error; do not cast inferred route, loader or search data or weaken checks.
- Use `createConvexRouteQuery` from `convex-route-query` for every frontend Convex application read, including route loaders and shared viewer UI. Define one helper per generated query reference and use its loader and subscription methods with the same normalized arguments. Avoid parallel query options, payload types, and wrappers.
- Await `fetchRoute` for route data and access checks required by the initial response, or `fetchQuery` when the loader needs no route-data fragment. Let failures reach the route boundary as safe errors. Reserve `prefetchRoute` and `prefetchQuery` for optional cache warming because they swallow query failures. Return only the `routeData` fragment from a `fetchRoute` result. It carries normalized arguments, while private query results stay in the Query cache for SSR hydration.
- Make QueryClient, Convex SSR clients and mutable request state local to the router/request factory. Never keep a user's credentials, viewer, request context or mutable cache in module state.
- Use the native Convex React Query adapter and Start SSR integration to power the library's cache, hydration, and subscriptions. Mutable data shown after SSR must remain live in the browser. Prove first HTML, hydration continuity, update without reload, and access loss behavior for the affected flow.
- The official integration reference is https://labs.convex.dev/better-auth/framework-guides/tanstack-start. Its example is generic: follow its package integration but preserve this project's stronger identity, privacy and error-handling rules. Do not forward a JWT or serialize it in route context, loader data, HTML or errors.
- Start's client-side route gates improve navigation UX only. Every protected Convex function and server boundary enforces authorization independently.
- Keep public, sign-in, account, and admin copy production-facing by putting framework, setup, and debug instructions in development-only tools or developer documentation.

## Identity and authorization

- Resolve identity before selecting the initial response for signed-in or signed-out-only routes. A truly pending identity may retain already-authorized SSR content; a confirmed sign-out or role loss must hide protected content.
- At the server-only request authentication boundary, resolve the Better Auth session and token natively and verify the current viewer with an uncached `ConvexHttpClient.query` using that request's credentials. `convex-route-query` fetch helpers require a `QueryClient`, whose cached viewer can belong to a prior principal. Use the library for the shared viewer UI subscription.
- A token endpoint 401 can represent either no session or a session lookup failure. Never classify by status alone. The auth boundary must distinguish a positively confirmed absent session from timeout, adapter/service error, malformed response, unexpected response or other failed lookup using the pinned Better Auth and Convex component contract. Do not prescribe an undocumented endpoint. Failed lookup returns a generic service failure and must not expose protected data or a signed-out-only form.
- Keep platform-admin role separate from organization roles and preserve explicit current-session and backend role checks. Validate return-to values at parse time and at final use; secrets never belong in URLs.
- When changing authorization, exercise the protected backend function directly for signed-out, allowed and denied identities, plus relevant stale-session or revoked-role behavior. Never infer backend security from a route redirect.
- Keep authenticated documents, redirects and private viewer responses private/no-store. Sanitize errors before serialization; a generic visual error screen does not prevent its underlying message from entering hydration data.
- Do not preserve private Query cache across principal changes. Check live identity, role and query error before rendering a protected subtree; cached success alone is not authorization.

## Convex, data and generated files

- Convex validators, backend functions, transactions, scheduling, generated APIs, and Better Auth component APIs stay native. Use native APIs to call Convex mutations and actions. Never hand-edit convex/_generated or generated Better Auth schema output.
- Use the native generator for the affected output and verify it against the installed package version. Keep generated prerequisites ordered before typechecking and CI consumers. A build is not a route-generation command unless the current manifest explicitly defines it that way.
- Inspect exact account/team, project, deployment and environment before commands that can write remotely. A key identifies a target but does not authorize a write. Native convex deploy may select the project default production deployment when CONVEX_DEPLOYMENT is set; verify the command contract and effective target before use. No server startup may start a Convex watcher, sync environment values, deploy, seed data or call a provider implicitly.
- Preserve populated data. Expand schemas compatibly, migrate and verify existing records, then tighten. Do not delete records or disable validators to make a deployment pass.
- This project uses a Convex component filename compatibility split: keep the neutral environment declaration separate from the CLI-only Convex env.config.ts re-export. Do not fold the declaration back into a component-discovery path without proving the installed Convex behavior.
- Affect CLI 0.0.5 can activate encrypted profiles and run commands with Vite public values. For `affect env sync-dev`, use `MISE_NO_ENV=1 mise exec -- bunx --no-install affect env sync-dev` with the matching development `DOTENV_PRIVATE_KEY`; it reads the development profile directly, verifies the key, deployment identity and canonical Vite Convex URLs, then writes only present settings declared by `convex/env.config.ts`. This is a separately authorized remote environment mutation and does not deploy code. `affect deploy` requires `VERCEL_ENV=preview|production`, its matching encrypted profile/key, and `VERCEL_GIT_COMMIT_REF` for preview. During the native Convex deploy callback, the CLI writes declared settings before the TanStack build and final backend push. Settings can change even if the build fails. It may also push backend functions, schema and indexes, and does not publish frontend assets. Resolve and authorize each exact target before use. Never run either command automatically at startup or add Next-public aliases.

## Environment and local runtime

- Use Bun 1.4.4 and Node 24.22.2 from Mise. On a fresh checkout, install the pinned tools and use bun install --frozen-lockfile. Do not print decrypted profile values or key material.
- Encrypted profiles are separate. Use only the matching DOTENV_PRIVATE_KEY in the process that needs that profile. Keep secrets unprefixed; only explicitly reviewed public values may use VITE_ names.
- Vite publishes `VITE_` values according to its normal public prefix behavior, especially in development. The web env source now uses explicit named reads for its five reviewed public values, and a synthetic production transform excluded unrelated markers; this does not create a hard development allowlist. Keep secrets unprefixed, do not pass the whole `import.meta.env` object through the public config boundary, and recheck transformed output when changing this boundary.
- The development server binds to loopback and honors a strict port. Root bun run dev is the Portless path; use Portless's advertised scheme/host as the canonical browser origin. The direct bun run dev:localhost fallback is a different origin and must have matching auth trust and cookie behavior. Do not trust forwarding headers globally.
- Local dev-server operation is allowed when needed for the requested work. It does not authorize starting a backend watcher or making remote writes. Stop only servers started for the task.
- No production/preview target or provider account is inferred from local files, credentials, or Vercel configuration.

## Tests, visual evidence and acceptance

- Run only the focused adjacent test(s) and typecheck needed for the change. Do not run a full suite/build by default. If the user asks for broader verification, follow that scope.
- Format only changed project-owned files. The root formatter exclusions for retained upstream skills and generated artifacts were independently checked on the frozen local snapshot; do not write-format vendor or generated files.
- For requested or material UI/navigation/auth runtime verification, use a real browser and inspect the final artifact at a narrow phone width and a representative wider width. Exercise affected interactions, loading/error states, keyboard/focus and Back/Forward where relevant. Screenshots/observations must identify viewport and final source revision. DOM assertions alone are not visual acceptance.
- For logic-only changes, prefer the focused unit/backend test; do not add a browser ritual.
- Report what ran and what remains pending. Do not claim a historical checklist or source inspection proves current runtime behavior.

## Effect, optional services and telemetry

- Use Effect for domain validation and typed failure composition in .ts modules. Keep React handlers native and avoid Promise-to-Effect-to-Promise wrappers. Follow the installed Effect version and tested repository examples.
- Keep optional PostHog and tracing disabled when configuration is absent. Missing telemetry must not block public content or auth.
- Trace only stable operation names and non-sensitive attributes. Never export passwords, OTPs, cookies, JWTs, authorization headers, raw bodies, or sensitive URLs. Keep HTTP exporters out of Convex queries and mutations; verify actual action/HTTP wiring and disabled/failure paths when tracing changes.
- Keep app data collection minimized. Preserve no-capture/no-record treatment for the development email dock and its previews.
