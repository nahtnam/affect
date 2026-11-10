---
name: tanstack-dev-loop
description: Verify a requested or material TanStack Start/Router runtime change in a real browser; use for UI, navigation, auth flow or SSR behavior, not routine logic-only edits.
---

# TanStack runtime verification

Use only when the task calls for runtime evidence or the change materially affects user-visible UI, navigation, or auth flow. For logic-only changes, use the focused test instead.

## Before starting

- Read AGENTS.md and the task's acceptance criteria. Confirm the source change is complete and identify its final revision/diff.
- Inspect root and apps/web scripts. Use the authorized local dev command; do not invent a browser or verification script.
- The Vite server binds to loopback. Root dev is Portless; use its advertised URL exactly. Direct localhost uses its own scheme and origin. Do not trust forwarding headers or silently substitute another origin.
- A local server may be started for the scoped verification. It does not authorize a Convex watcher, environment sync, remote writes, seeding or deployment.
- If the flow needs a hosted Convex backend, verify the exact account/team/project/development deployment and authorization before any command that could write. Do not use preview or production for convenience. If no eligible target is authorized, stop that dependent verification and report it.
- Use synthetic identities and values. Never expose passwords, OTP, cookies or auth tokens in output.

## Browser checks

- Inspect the final artifact visually at a narrow phone width and a representative wider width. Capture screenshots and record viewport/emulation context and the final source revision.
- Follow the actual controls for the changed flow. Check keyboard/focus behavior, open/close/selection, loading, empty or error state, safe redirects, and Back/Forward when relevant.
- For SSR/auth: inspect raw document status, redirects, relevant private/no-store headers and body before hydration when applicable. Check that protected data is absent in denied responses and that identity-service failure is not misreported as signed out.
- For mutable Convex data: confirm initial server content, hydration without a flash, and a live update in the already-open page without reload. For access changes, confirm protected content hides after resolved session/role loss and is not reused for another principal.
- When changing browser authentication or ownership of a private live cache, replay the affected boundary. For token handling, after browser token acquisition has failed while the server session remains valid, keep protected data hidden, show a generic retry state, and do not redirect to sign-in. Verify genuinely pending token acquisition preserves authorized SSR, delayed token success restores the page, and confirmed absence signs out. For cache ownership, test after the live viewer has changed or cleared while a prior protected result remains cached: navigate as authorized A to a public route in the same document, switch to authorized B, then return to a protected route. Verify B receives fresh content without A's data or a cache-mismatch error; include same-principal live navigation as a control. A deterministic fixture may establish event ordering, but browser evidence must confirm navigation and rendering.
- Check actual browser console/network errors that affect the flow. DOM counts and assertions alone do not establish visual acceptance.
- Recheck affected views after the last UI edit.

## Report

Separate what the code contains from what the browser demonstrated. Record exact route, widths, relevant actions, result, screenshot paths and final revision. Name missing profile, auth, trust-origin or target prerequisites; do not substitute code inspection for a blocked runtime check.
