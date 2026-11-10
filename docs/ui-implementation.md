# Development email preview UI handoff

## Current entry and behavior

In a local development browser, open **TanStack Devtools → Plugins → Emails**, then select **Load emails**. The app shell lazy-loads the host only in development and client-side. The Emails panel does not read the inbox on mount; it first checks the local availability endpoint after explicit activation.

The panel ties the active session to the supplied mount and its ancestor visibility. Hiding or detaching the pane aborts in-flight reads, clears email and selection state, cancels timers, and requires a fresh activation after the pane returns. An inbox `404` shows the unavailable/manual-retry state; other read failures use the retry interval. HTML preview remains isolated and clipboard copy rechecks session eligibility and expiry.

## Path inventory

| Disposition                            | Paths                                                                                                                                                                                                                                   |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New                                    | `apps/web/src/devtools.tsx`; `apps/web/src/affect-dev/emails-panel.tsx`; `apps/web/src/affect-dev/emails-panel.test.tsx`                                                                                                                |
| Deleted                                | `apps/web/src/affect-dev/panel.tsx`; `apps/web/src/affect-dev/dock.css`                                                                                                                                                                 |
| Retained and updated                   | `apps/web/src/routes/__root.tsx`; `apps/web/src/styles.css`; `apps/web/src/auth/sign-in-form.tsx`; `apps/web/src/affect-dev/client.ts`; `apps/web/src/affect-dev/client.test.ts`; `apps/web/src/affect-dev/email-preview.tsx`           |
| Retained transport and preview support | `apps/web/src/affect-dev/contracts.ts`; `apps/web/src/affect-dev/preview-document.ts`; `apps/web/server/affect-dev/bridge.server.ts`; `apps/web/server/affect-dev/inbox.server.ts`; `apps/web/server/affect-dev/request-gate.server.ts` |

The retained server transport still owns origin/runtime gating and the in-memory inbox. It was not changed for this UI replacement. No standalone floating dock or dock stylesheet remains in the app source.

## Focused verification

- `MISE_NO_ENV=1 bun run --filter @affect/web typecheck` — passed before the final three responsive utility-class edits; those edits changed no TypeScript behavior.
- `MISE_NO_ENV=1 bunx vitest run apps/web/src/affect-dev/client.test.ts apps/web/src/affect-dev/emails-panel.test.tsx` — 16 tests passed across 2 files before the responsive layout-only corrections. Coverage includes explicit activation, availability gating, 404 handling, transient retry recovery, stale-response rejection, resize/ancestor-visibility abort, fresh activation after re-show, transition wake-up, and plugin destruction.
- Changed-file lint passed for the panel and preview layout edits; the final preview edit was checked with `MISE_NO_ENV=1 bun run lint -- apps/web/src/affect-dev/email-preview.tsx`.
- Frozen source manifest: `/tmp/affect-email-devtools-20261109/final-source.sha256` (9 entries; all matched before and after the final Chrome run). Manifest digest: `7254b17fe16741125b87bc5c3b7ad12270ff017500fdead9899351b3c0fad6c1`.

## Final Chrome acceptance and evidence boundary

Chrome 157 passed against the final source freeze at desktop 1280×720 and phone 390×568. On phone, three inbox rows and two real touchscreen gestures exposed the HTML heading/body; physical hit-testing confirmed reachability of the Preview, Text, Source, and Copy controls without resizing the drawer. The desktop view retained a side-by-side list/detail layout. The sign-in document’s raw HTML contained no Devtools or preview markers, and the visible inbox required explicit Load emails before any status or inbox read.

Native Settings, plugin close, host close, and hidden-ancestor paths aborted held reads, cleared preview state, stopped polling, and required fresh Load intent on return. Detach was verified separately: its popup showed neutral copy and made no new inbox/status reads. A second tab did not load the inbox. Browser storage, BroadcastChannel, console, and server logs contained no email/OTP markers. The HTML iframe remained sandboxed and no-referrer; hostile markup stayed inert. Text, escaped Source, and Copy worked on both layouts.

The final replay used the app’s local Start and Nitro handlers with a synthetic in-process Convex upstream. It was not a hosted real-email test. Targeted production client/SSR fixtures excluded development modules and native Nitro scanning marked the email routes inactive in production; no full app build was run. Refresh focus, one-shot 503 recovery, gated 404, expiry, and no-fallback capture-send checks passed on the immediately preceding source revision; only three responsive utility classes in `email-preview.tsx` changed afterward. Earlier SecurityErrors came from the harness accessing localStorage from the opaque sandboxed iframe and did not recur after removing that harness initializer. One failed cold Start client import also did not recur in the fresh-context replay; its original transport cause was not captured. The owned Chrome contexts and loopback server exited. No hosted deployment, real email delivery, or production operation was performed.

Evidence is recorded under `/tmp/affect-email-devtools-20261109/runtime/`, including `final-acceptance.md`, desktop and phone screenshots, browser evidence JSON, runtime source hashes, and targeted production-boundary output. Final writer-manifest digest: `7254b17fe16741125b87bc5c3b7ad12270ff017500fdead9899351b3c0fad6c1`; browser-source digest: `4c07476666e3eb1b09140186c287b08e6b97509b83618b595f1de007cf489af8`.
