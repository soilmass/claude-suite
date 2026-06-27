---
name: error-boundaries
description: >
  Author the route-level expression of Rule 4 in the App Router: the segment's
  loading.tsx, error.tsx, and not-found.tsx neighbors, each as a real recovery surface
  rather than a spinner or a blank screen. Covers the error.tsx Client Component
  contract (the error/reset props, the reset() retry, digest logging), global-error.tsx
  for the root, notFound()/not-found.tsx, and Suspense-backed loading skeletons that
  match the success layout. Use when: "error boundary", "loading state route", "not
  found page", "handle route errors".
  Do NOT use for: a single data-bound component's four states inside a feature (use
  vertical-slice), or the accessibility of the error/loading UI itself (use a11y-gate).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the route-state failure class: a segment that ships
    only page.tsx, so a thrown error becomes Next's default overlay or a white screen, a
    slow fetch becomes a frozen route, and a missing row 500s instead of 404ing.
    Baseline section is the encoded failure class; replace with an observed transcript.
---

# error-boundaries

The route-level half of Rule 4. The App Router expresses loading, error, and not-found as
**files alongside `page.tsx`**, not as branches inside a component — so the failure here is
structural: a segment with only `page.tsx` has no fallback when its server data is slow,
throws, or is missing. This skill writes those neighbors as genuine recovery surfaces. Spine
and rules: `../../CLAUDE.md` (Rule 4 — all four states); do not restate them.

---

## Non-Negotiable Rules

These ship as ordinary-looking segments that render fine until something goes wrong:

- **Never ship a data-bound segment with only `page.tsx`.** Rule 4 lives in the file system
  here: `loading.tsx` for the pending state, `error.tsx` for the thrown state, `not-found.tsx`
  for the absent state, plus the success `page.tsx`. Three of four states missing is incomplete.
- **Never write an `error.tsx` whose only action is to show the message.** It is a Client
  Component (`"use client"`) that receives `{ error, reset }`; it MUST offer `reset()` (or a
  navigation) so the user can recover, not dead-end.
- **Never render the raw `error.message` or `error.stack` to the user.** Show a stable,
  in-voice message; log `error.digest` (and report to Sentry) for the real cause. Leaking
  internals is both a UX and a Rule 9-adjacent disclosure failure.
- **Never use a bare spinner as `loading.tsx` for a known layout.** Render a skeleton that
  matches the success layout's shape so the shell does not reflow when data arrives (CLS).

Refuse these rationalizations: "the fetch never fails in dev"; "Next has a default error
page"; "I'll add loading.tsx later"; "a spinner is good enough"; "just show the error so we
can debug it in prod."

---

## When to Use

- Standing up the `loading.tsx` / `error.tsx` / `not-found.tsx` neighbors for a route segment.
- Adding `reset()`-based recovery to a route that throws on a failed server fetch.
- Wiring `notFound()` from a server component/loader when a row is absent or not owned.
- Adding `global-error.tsx` to catch failures in the root layout itself.
- Designing a loading skeleton that mirrors the success layout to avoid reflow.

## When NOT to Use

- The loading/empty/error/success states of one component *inside* a feature slice → `vertical-slice`.
- The segment's overall file shape, server/client split, route handlers → `nextjs-app-router`.
- Axe/WCAG review of the error and loading surfaces (focus, live regions, contrast) → `a11y-gate`.
- The token-driven styling of skeletons and error cards → `design-tokens` / `tailwind-v4-component-style`.

---

## Procedure

1. **Inventory the segment's failure modes first (low-interrogation).** For each route, name
   what "pending", "thrown", and "absent" mean concretely — a slow Drizzle query, a tRPC error,
   a missing or unowned row. This decides which neighbor files the segment needs. See
   `references/route-states.md`.
2. **Write `loading.tsx` as a layout-matching skeleton (medium).** It is the Suspense fallback
   for the segment; mirror the success layout's grid/cards so the shell does not reflow when
   data resolves. Use token spacing/colors, never raw values (Rule 3). See `references/route-states.md`.
3. **Write `error.tsx` as a recovering Client Component (high — this is where errors leak or
   dead-end).** `"use client"`; accept `{ error, reset }`; render a stable in-voice message;
   call `reset()` to retry the segment and/or offer a route home; log `error.digest` to
   Sentry. Never print `error.message`. See `references/route-states.md`.
4. **Trigger `not-found.tsx` from the loader, not from the renderer (high — ownership tells).**
   Call `notFound()` in the server component/function when the row is missing **or not owned by
   `ctx.auth.userId`** (Rule 2 — return 404, never reveal existence). Render `not-found.tsx` as
   the absent-state UI with a way back. See `references/route-states.md`.
5. **Add `global-error.tsx` for root-layout failures (medium).** Segment `error.tsx` cannot
   catch an error in the root `layout.tsx`; `global-error.tsx` (which renders its own `<html>`/
   `<body>`) does. One per app at the root. See `references/route-states.md`.
6. **Set the boundary granularity deliberately (medium).** An `error.tsx` catches throws from
   its segment and below but not from its sibling `layout.tsx`. Place boundaries so one widget's
   failure does not blank the whole route; combine with `<Suspense>` islands for partial loading.
   Record any non-obvious nesting in `DECISIONS.md`.
7. **Hand the surfaces to the gates (suggestion-first).** Route the finished states to
   `a11y-gate` (focus on reset, live-region announcement, skeleton not announced as content) and
   `rule-audit` (Rule 4 complete, Rule 3 tokens, Rule 2 the 404-on-unowned path).

---

## Composes With

- **Consumes:** `nextjs-app-router` (the segment shape these files live in), `design-tokens`
  (skeleton/error-card tokens).
- **Pairs with:** `vertical-slice` — it owns the four states *inside* a component; this owns
  them at the *route* boundary. The two meet at the segment.
- **Hands off:** accessibility of the surfaces → `a11y-gate`; final rule check → `rule-audit`
  (Rules 2, 3, 4).
- **Runs against:** `../../CLAUDE.md` — Rule 4 (all four states), Rule 2 (404 on unowned).

---

## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)

> Encoded failure class per the suite's design; replace with a real run-without-the-skill
> transcript before treating this as evaluated.

**Failure class encoded:** Asked to "build the page for X," the agent writes only `page.tsx`.
A slow server fetch leaves the route frozen with no `loading.tsx`, so the user stares at the
previous page until data lands. A thrown query produces Next's dev error overlay in dev and a
blank/500 in prod because there is no `error.tsx` — and when one is finally added, it just
prints `error.message` with no `reset()`, dead-ending the user and leaking the stack. A missing
row throws a 500 instead of calling `notFound()`, and an *unowned* row is 500'd rather than
404'd, leaking that the resource exists (Rule 2). The loading state, where present, is a bare
centered spinner that reflows the whole layout when content arrives. It renders in dev and
looks done.

---

## Examples

**Input:** "Build the page for a single invoice at /invoices/[id]."
**Output:** `loading.tsx` renders a skeleton matching the invoice header + line-item table;
the loader calls `notFound()` when the invoice is missing or `invoice.userId !== ctx.auth.userId`
(Rule 2); `not-found.tsx` shows an in-voice "invoice not found" with a link back to the list;
`error.tsx` is a `"use client"` boundary with a "Try again" `reset()` button and logs
`error.digest`. Money rendered as minor units per Rule 5 lives in the success `page.tsx`.

**Input:** "Our dashboard white-screens when one widget's data fails."
**Output:** Wrap each widget in its own `<Suspense>` and scope an `error.tsx` so a single
widget's throw degrades to an inline error card while the rest renders; add `global-error.tsx`
only for root-layout failures. Granularity recorded in `DECISIONS.md`.

**Input:** "The error page just shows a stack trace in production."
**Output:** Replace the raw `error.message`/`stack` render with a stable in-voice message, a
`reset()` retry plus a home link, and `useEffect`-reported `error.digest` to Sentry — pattern
in `references/route-states.md`.

---

## Edge Cases

- **Error thrown in the root `layout.tsx`** → a segment `error.tsx` cannot catch it; use
  `global-error.tsx` (renders its own `<html>`/`<body>`), one at the app root.
- **`reset()` keeps re-throwing because the cause is persistent** → don't loop the user on a
  dead retry; offer a navigation away (home/list) and surface a support path; reset is for
  transient failures.
- **A row exists but belongs to another user** → call `notFound()` (404), not `forbidden`/403
  — revealing existence is the Rule 2 ownership leak; treat unowned as absent.
- **Streaming with `<Suspense>` islands** → the nearest `loading.tsx` only covers the initial
  segment load; per-island fallbacks come from each `<Suspense fallback>`, so design both.

---

## References

- `references/route-states.md` — the four route-level files with correct code: `loading.tsx`
  skeletons, the `error.tsx` Client Component contract (`error`/`reset`, digest logging, no
  raw message), `global-error.tsx`, `notFound()`/`not-found.tsx`, ownership-as-404 (Rule 2),
  Suspense granularity, and the per-segment completeness checklist.

## Scripts

Reserved. A script would earn its place if a static check could flag a segment directory that
has `page.tsx` but is missing its `loading`/`error`/`not-found` neighbors, or an `error.tsx`
that renders `error.message`/`error.stack` or lacks a `reset` call — both are file-system /
AST-detectable. Until then `rule-audit` (Rule 4) covers the completeness check.
