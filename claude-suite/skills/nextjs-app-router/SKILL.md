---
name: nextjs-app-router
description: >
  Structure a Next.js App Router segment correctly on the edge: the file conventions
  (layout/page/loading/error/not-found/route handlers), the server-vs-client component
  boundary, streaming via Suspense, parallel and intercepting routes, and metadata. Keeps
  the default Server Component, pushes "use client" to the smallest leaf, and keeps secrets
  off the client. Use when: "set up routing", "app router structure", "server component vs
  client", "add a route handler", "layout for".
  Do NOT use for: laying out a full feature end to end across schema/tRPC/UI (use
  vertical-slice), data caching/revalidation specifics (use data-fetching-cache), or the
  error/empty/loading UI design itself (use error-boundaries).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the App Router structural failure class: over-broad
    "use client", secrets leaking to the client, unvalidated route handlers, missing
    loading/error/not-found neighbors. Baseline section is the encoded failure class;
    replace with an observed transcript.
---

# nextjs-app-router

The structural layer beneath every feature. App Router is file-system-driven, so the wrong
file in the wrong place is a defect that compiles: a "use client" too high drags a whole
subtree to the browser, a server env read in a Client Component leaks a secret, a route
handler that trusts its body skips Rule 8. This skill gets the segment shape right so
`vertical-slice` can fill it in. Spine and rules: `../../CLAUDE.md` (App Router only, edge);
do not restate them.

---

## Non-Negotiable Rules

The App Router makes these failures invisible — they ship as ordinary-looking files:

- **Never put `"use client"` on a segment to satisfy one hook.** Push the boundary to the
  smallest interactive leaf and keep the page/layout a Server Component. A `"use client"` at
  the top of a route tree opts the entire subtree out of RSC and the edge data path.
- **Never read a server env var or secret in a Client Component, or pass one as a prop.**
  Rule 9. Only `NEXT_PUBLIC_*` crosses the boundary, and nothing secret is ever `NEXT_PUBLIC_*`.
- **Never use route-handler input (body, `params`, `searchParams`) before Zod-parsing it.**
  Rule 8 — a route handler is an external boundary just like a tRPC input.
- **Never ship a data-bound segment without its `loading`/`error`/`not-found` neighbors.**
  Rule 4's four states live in the file system here; happy-path-only is incomplete.

Refuse these rationalizations: "the whole page needs interactivity so the layout goes
client"; "it's just a build-time env, reading it client-side is fine"; "the body comes from
our own form, it's already valid"; "I'll add loading.tsx later."

---

## When to Use

- Standing up a new route segment, nested layout, or shared layout shell.
- Deciding where the server/client boundary falls in a tree of components.
- Adding a `route.ts` handler (webhook, OAuth callback, file upload, non-tRPC endpoint).
- Wiring streaming/Suspense, parallel slots, intercepting routes, or metadata.

## When NOT to Use

- Building a whole feature (schema → tRPC → Zod → form → UI) → `vertical-slice`.
- Caching, `revalidate`, `cache()`, tag invalidation, `fetch` cache semantics → `data-fetching-cache`.
- Designing the actual loading/empty/error UI and its a11y → `error-boundaries`.
- The token-driven styling of any of these surfaces → `design-tokens`.

---

## Procedure

1. **Map the segment tree before writing files (low-interrogation).** Decide routes, dynamic
   segments (`[id]`), groups (`(marketing)`), and where shared chrome nests. The folder tree
   *is* the URL and the layout-nesting model. See `references/routing-patterns.md`.
2. **Default every file to a Server Component; mark client leaves last (high — this is where
   secrets leak).** Author `page.tsx`/`layout.tsx` as Server Components. Add `"use client"`
   only to the smallest component that needs state/effects/event handlers, and verify no
   secret crosses it. See `references/component-boundaries.md`.
3. **Nest layouts; never fetch app-wide data in a fake `_app`.** A `layout.tsx` wraps its
   subtree and persists across navigation. Put auth-shell and providers here. Pages-Router
   `_app`/`getServerSideProps` patterns are drift — stop and record any deviation in `DECISIONS.md`.
4. **Add route handlers as validated, edge-aware boundaries (high — external input).** In
   `route.ts`, Zod-parse the body/`params`/`searchParams` (Rule 8), set
   `export const runtime = "edge"` where compatible, and return typed `NextResponse`. See
   `references/routing-patterns.md`.
5. **Co-locate the four states as files (medium).** `loading.tsx` (Suspense fallback),
   `error.tsx` (a Client Component error boundary with `reset`), `not-found.tsx`, plus the
   success `page.tsx`. This is Rule 4 expressed structurally; hand the UI itself to `error-boundaries`.
6. **Stream with Suspense for slow data (medium).** Wrap slow server children in `<Suspense>`
   with a skeleton fallback so the shell paints first; reach for parallel routes (`@slot`) for
   dashboards and intercepting routes (`(.)`) for modal overlays. See `references/routing-patterns.md`.
7. **Set metadata without secrets (low).** Export static `metadata` or async
   `generateMetadata`; the latter runs on the server and may read params but never leaks a
   secret into the document. Hand the finished segment to `vertical-slice` or `rule-audit`.

---

## Composes With

- **Feeds:** `vertical-slice` — it builds the data/form/UI inside the segment shape this defines.
- **Pairs with:** `data-fetching-cache` (the data semantics inside these files),
  `error-boundaries` (the loading/error/not-found UI), `design-tokens` (their styling).
- **Hands off:** caching/revalidation → `data-fetching-cache`; sweeping segment renames →
  `refactor`; final check → `rule-audit` (Rules 4, 8, 9), `a11y-gate`, `security-pass`.
- **Runs against:** `../../CLAUDE.md` — App Router only, edge runtime as the fork-defining fact.

---

## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)

> Encoded failure class per the suite's design; replace with a real run-without-the-skill
> transcript before treating this as evaluated.

**Failure class encoded:** Asked to "set up the route for X," the agent slaps `"use client"`
at the top of `layout.tsx` so a `useState` somewhere works, dragging the whole subtree off
RSC and the edge data path; reads `process.env.DATABASE_URL` (or a Clerk secret) inside a
component that is now a Client Component, shipping it to the browser (Rule 9); writes a
`route.ts` that does `await req.json()` and uses the body unparsed (Rule 8); omits
`loading.tsx`, `error.tsx`, and `not-found.tsx`, so the segment has only a happy path
(Rule 4); and reaches for `getServerSideProps`/`_app` muscle memory from the Pages Router.
It renders in dev and looks done.

---

## Examples

**Input:** "Add a settings page with an editable profile form under /dashboard/settings."
**Output:** Creates `app/dashboard/settings/page.tsx` as a Server Component that reads the
user server-side; a `ProfileForm` leaf marked `"use client"` for RHF; `loading.tsx` skeleton
and `error.tsx` boundary alongside; layout chrome stays server. The form/mutation wiring is
handed to `vertical-slice`; styling to `design-tokens`.

**Input:** "We need a Stripe webhook endpoint."
**Output:** `app/api/webhooks/stripe/route.ts` with `export const runtime = "edge"`, raw-body
signature verification, then `Stripe.Event` Zod-parsed before use (Rule 8); secret read
server-side only (Rule 9); typed `NextResponse`. Threat-model questions handed to `security-pass`.

**Input:** "Make the photo grid open each photo in a modal but be linkable too."
**Output:** Intercepting route `(.)photo/[id]` renders the modal over the grid on client
navigation while `photo/[id]/page.tsx` serves the full page on hard load — pattern in
`references/routing-patterns.md`.

---

## Edge Cases

- **A whole page feels interactive** → don't make the page a Client Component; keep it a
  server shell and lift only the interactive island to `"use client"`. Server components can
  render client children, not vice-versa for server-only data.
- **A handler needs a Node-only dependency (e.g. some crypto/SDK)** → it can't be `runtime =
  "edge"`; set `runtime = "nodejs"` and record the exception in `DECISIONS.md` (the edge
  default is the spine).
- **You need a client value the server has (theme, user id for display)** → pass it as a
  serializable prop from the server parent; never re-fetch a secret to derive it client-side.
- **Modal-as-route reloaded directly** → ensure the non-intercepted `page.tsx` exists so a
  hard navigation/refresh renders a real page, not an empty slot.

---

## References

- `references/component-boundaries.md` — server vs client decision rules, where `"use client"`
  goes, serializable-prop boundary, the Rule 9 secret/env checklist, edge-runtime notes.
- `references/routing-patterns.md` — file conventions, route handlers with Zod, streaming/
  Suspense, parallel (`@slot`) and intercepting (`(.)`) routes, metadata/`generateMetadata`.

## Scripts

Reserved. A script would earn its place if a static check flagged `"use client"` files that
read non-`NEXT_PUBLIC_` `process.env`, or a `route.ts` using `req.json()`/`params` without a
Zod parse — both AST-detectable. Until then `rule-audit` covers Rules 8/9.
