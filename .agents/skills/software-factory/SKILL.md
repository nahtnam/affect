---
name: software-factory
description: Build a requested complete Affect application slice across TanStack routes, Convex behavior and verification; use when implementation is requested, not for review-only tasks.
---

# Affect feature slice

Use this skill for an end-to-end feature or migration behavior. For diagnosis or read-only review, inspect and report without editing unless the user also asks for a fix.

## Scope and implementation

1. Read AGENTS.md, PROJECT.md, and current worktree state. Read relevant rows in `docs/migration-parity.md` when the requested change affects migration behavior; unrelated feature work does not update the migration ledger.
2. Define the smallest usable slice, its caller-visible states, and the evidence needed. Keep unknown product requirements unresolved.
3. Follow existing TanStack Start and Router idioms: server-only work behind server functions/routes, route identity and search validation in typed route boundaries, and loader inputs normalized once.
4. Use `createConvexRouteQuery` from `convex-route-query` for all frontend Convex application reads, including loaders and shared viewer UI. Define one helper per generated query reference and use its loader and subscription methods with the same normalized arguments. Keep the native Convex React Query adapter and Start SSR integration for cache, hydration, and subscriptions.
   Await `fetchRoute` for route data and access checks required by the initial response, or `fetchQuery` when no route-data fragment is needed. Propagate safe errors to the route boundary and use prefetch helpers only for optional warming. Return only `fetchRoute`'s `routeData` fragment with normalized arguments. Keep private query results in the Query cache for hydration.
   For server-only request authentication, resolve the Better Auth session and token natively and verify the current viewer with an uncached `ConvexHttpClient.query` so a cached principal cannot authorize the request. Backend functions, mutations, and actions use native APIs.
5. Keep QueryClient and Convex SSR clients request-local. Preserve the server-rendered snapshot while initial auth settles, then keep the client live subscription current. A cached result does not prove current authorization.
6. Enforce authorization at every protected Convex function and server boundary. Route redirects are UX. On auth lookup, distinguish positively confirmed no-session from service/adapter failure; a token 401 alone is ambiguous. Fail closed and return safe errors.
7. Use native Convex and Better Auth generators for generated files. Keep schema changes compatible with populated data. Preserve old behavior or document an intentional omission with reason.
8. Keep app architecture Nitro-agnostic. Let only genuinely worker-specific local routes and process-local state use Nitro-owned server files.
9. For a file route addition, rename, or removal, start the root `mise exec -- bun run dev` command with the approved development profile so Vite's TanStack plugin regenerates `apps/web/src/routeTree.gen.ts`. Inspect and include the generated route tree before typechecking. Do not edit that generated file by hand or invent a separate route-generation command.

## Verification

- For scoped lint, run `bun run lint -- <changed paths>` from the repository root. Preserve the lint command’s own exit status when capturing output, and report the checked paths and any warnings. A scoped pass applies to those paths.
- Run focused tests for the behavior changed and a needed typecheck. Avoid full suite/build unless the task asks for it or a demonstrated prerequisite requires it.
- For substantive UI, auth-flow, or navigation changes, use tanstack-dev-loop after implementation. For logic-only work, do not add a browser run.
- Directly test protected backend functions for signed-out, allowed and denied callers. Add stale/revoked-session cases where the behavior changed.
- After SSR changes, inspect raw responses without following redirects when applicable; verify status, Location, no-store headers, body and serialized data. For live data, verify the hydrated page updates without reload.
- UI evidence must show actual final UI at narrow and wide widths and cover relevant interactions, loading/error states and Back/Forward. Tie evidence to the final source revision.
- Re-run affected checks after the last edit. For migration behavior, record implementation separately from verified runtime behavior in `docs/migration-parity.md`; for ordinary features, use the task's evidence report instead of adding ledger rows.

## Independent review and lifecycle

Use independent review when requested or when the security boundary materially changed. Resolve findings against source and evidence before repair. Keep edits within assigned files and preserve parallel work.

Edit, commit, push, PR, merge, publish and deploy are separate lifecycle transitions. This project migration is local until the user explicitly authorizes another transition. Before any remote Convex action, resolve the exact target and its environment, then confirm that the requested action is authorized.
