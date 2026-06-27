---
name: observability-setup
description: >
  Instrument OpenTelemetry traces and Sentry error capture at genesis for the edge-stack app:
  a root `instrumentation.ts` that registers OTel and the per-runtime Sentry SDKs, spans that
  propagate across edge requests and tRPC procedures, `onRequestError` wiring so server and
  edge errors reach Sentry, and release tracking with source maps gated behind a server-only
  auth token. Covers the wiring so a request can be traced end to end and an exception is
  attributable to a release — not how much you log or what it costs.
  Use when: "set up observability", "otel", "sentry", "tracing", "instrument errors".
  Do NOT use for: log volume / sampling / cost of logging (use log-discipline), setting a
  spend cap before launch (use spend-cap).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the "observability that leaks, lies, or never fires" failure
    class: the Sentry auth token shipped client-side, traces that die at the edge boundary,
    100%-sampled spans, and errors with no release so nothing is attributable.
    Baseline observed (clean-room capture).
---

# observability-setup

Wire OTel traces and Sentry so an edge request is traceable end to end and every exception
is pinned to a release — the genesis instrumentation the spine (`../../CLAUDE.md`) mandates
("OTel traces + Sentry, instrumented at genesis"). This skill owns the *wiring*; the cost and
PII discipline of what flows through it belongs to `log-discipline` and `spend-cap`.

---

## Non-Negotiable Rules
- **Never put `SENTRY_AUTH_TOKEN` (or any source-map/CI upload token) in a `NEXT_PUBLIC_*`
  var or a Client Component.** The DSN is publishable; the auth token is a secret that can
  read/write your project (Rule 9). It lives server-side, used only by `withSentryConfig` at
  build time.
- **Never ship `tracesSampleRate: 1.0` to production.** Full sampling is the fastest path to
  a surprise bill and is `spend-cap`'s tripwire; choose a fractional rate and make it
  env-driven. Sampling *policy* is `log-discipline`/`spend-cap`'s call — wire the knob, don't
  hardcode it open.
- **Never instrument without a `release` identity.** An error with no release (git SHA /
  `VERCEL_GIT_COMMIT_SHA`) is unattributable and breaks regression tracking; release is set
  in `Sentry.init` and matched to the source-map upload.
- **Never use the full Node OpenTelemetry SDK in edge/middleware code.** It depends on Node
  APIs absent at the edge; use `@vercel/otel` / the Sentry edge SDK. Edge-API failures are
  `edge-runtime-constraints`' domain.

Refuse these rationalizations: "prefix the token `NEXT_PUBLIC_` so the build can see it" ·
"sample everything, we'll tune later" · "release tracking is a nice-to-have" · "just import
the OTel Node SDK in middleware."

---

## When to Use
- Standing up tracing + error capture on a fresh edge-stack project (right after `t3-genesis`).
- Adding spans across tRPC procedures or edge requests so a slow path is attributable.
- Wiring `onRequestError` so server- and edge-thrown errors reach Sentry with request context.
- Setting up release tracking + source-map upload so stack traces de-minify per deploy.

## When NOT to Use
- Deciding how much to log, log levels, or sampling to control spend → `log-discipline`.
- Setting the pre-launch spend cap / budget alerts → `spend-cap`.
- A build/runtime failure because an instrumentation import uses a Node API at the edge →
  `edge-runtime-constraints`.
- Validating the env-var shape itself (the Zod boundary) → `env-validation`.

---

## Procedure

1. **Confirm the runtime split before writing a line (medium cost).** Next.js App Router runs
   three runtimes — browser, Node server, and edge — and each needs its own Sentry init. A
   single config will silently miss two of them. Map which routes are edge vs node, then plan
   one init per runtime. See `references/sentry-nextjs-edge.md`.

2. **Create the root `instrumentation.ts` as the single entry point (low cost).** Export
   `register()`; call `registerOTel({ serviceName })` from `@vercel/otel` (edge-safe), then
   dynamically import the Sentry server/edge config based on `process.env.NEXT_RUNTIME`. Also
   export `onRequestError = Sentry.captureRequestError`. This is the one hook Next calls on
   boot. Full file in `references/otel-tracing.md`.

3. **Init Sentry per runtime with env-driven sampling and a release (high cost — Rules 5/9
   boundaries live here).** Write `sentry.server.config.ts`, `sentry.edge.config.ts`, and the
   client init (`instrumentation-client.ts`). Each: `dsn` from a public var, `environment`,
   `release` from the git SHA, `tracesSampleRate` from env (never `1.0`), `sendDefaultPii:
   false`. The DSN is publishable; nothing secret goes here. See `references/sentry-nextjs-edge.md`.

4. **Validate the observability env vars at the boundary (medium cost — Rule 8).** Add
   `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` (server-only), `SENTRY_ENVIRONMENT`,
   `VERCEL_GIT_COMMIT_SHA` (the release identity every init reads), and the sample-rate vars to
   the Zod env schema so a missing DSN, a missing release, or a misplaced token fails the build,
   not production. Hand the schema mechanics to `env-validation`. Token placement is Rule 9.

5. **Wrap `withSentryConfig` for release + source maps (high cost — Rule 9).** Wrap
   `next.config` so the build uploads source maps using `SENTRY_AUTH_TOKEN` (server, build-time
   only) and stamps the release. Enable `tunnelRoute` to dodge ad-blockers; keep
   `widenClientFileUpload` and `disableLogger` deliberate. See `references/sentry-nextjs-edge.md`.

6. **Add cross-boundary spans, not just auto-instrumentation (medium cost — Rule 7-adjacent).**
   `@vercel/otel` auto-instruments fetch and propagates W3C `traceparent`; add a tRPC middleware
   that opens a span per procedure so a slow query or an N+1 (see `n1-hunter`) shows up as a
   named child span. Span-creation pattern and trace propagation are in `references/otel-tracing.md`.

7. **Set sampling + PII defaults conservatively, then hand off (low cost, high leverage).**
   Default `tracesSampleRate` low, `sendDefaultPii: false`, scrub bodies in `beforeSend`. The
   *policy* — how aggressively to sample, what the budget allows — is `log-discipline` and
   `spend-cap`'s call; record any non-default rate and rationale in `DECISIONS.md`.

---

## Composes With
- **Consumes:** `t3-genesis` (the project + `next.config`, middleware, and tRPC root this
  instrumentation hooks into already exist), `env-validation` (the Zod env boundary the DSN /
  auth-token vars are added to, Rule 8).
- **Pairs with:** `log-discipline` (owns log volume, levels, and sampling policy that rides on
  this wiring), `spend-cap` (the budget the trace sample rate must respect).
- **Hands off:** `edge-runtime-constraints` when an instrumentation import trips a Node API at
  the edge; `n1-hunter` when spans reveal per-row queries in a loop (Rule 7).

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project
> conventions). The encoded failure class was confirmed.

**Observed run.** Asked to instrument observability, the naive agent produced a clean,
conventional `@sentry/nextjs` wizard wiring — client/server/edge configs, `instrumentation.ts`,
`withSentryConfig` source-map upload, a `global-error` boundary, and a sketched tRPC `onError`.
But it hardcoded `tracesSampleRate: 1.0` in all three runtimes (the top edge cost driver the
stack warns against), enabled Session Replay with `maskAllText: false` / `blockAllMedia: false`
and no `beforeSend` scrubbing (capturing user content and request bodies — PII), set no
`release` identity, read env vars directly with no Zod boundary, and wired no OTel exporter at
all despite the OTel brief.

```ts
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,                 // every request traced + billed, all envs
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false }), // PII capture
  ],
});
```

**Failure class (confirmed).** Default Sentry wiring instruments *that an error happened* but
not *cheaply, attributably, or safely*: it ships full sampling (a surprise bill), no release
(errors unpinned to a deploy, source maps unreliable), unvalidated env boundaries (Rule 8), and
PII-leaking capture (Session Replay + unscrubbed bodies) — and skips the vendor-neutral OTel
trace pipeline entirely. This skill forces env-driven sampling, a release identity, a Zod env
boundary, PII defaults off, and real OTel registration.

---

## Examples

**Input:** "Set up Sentry for the app."
**Output:** Creates `instrumentation.ts` (`register` → `registerOTel` + runtime-gated Sentry
import, plus `onRequestError`), `sentry.server.config.ts`, `sentry.edge.config.ts`, and
`instrumentation-client.ts`, each with env-driven `tracesSampleRate`, `release` from
`VERCEL_GIT_COMMIT_SHA`, `sendDefaultPii: false`. Wraps `next.config` in `withSentryConfig`
using server-only `SENTRY_AUTH_TOKEN`. Adds `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_AUTH_TOKEN` to
the Zod env schema. Server, edge, and client errors all report; traces de-minify per release.

**Input:** "Why is this tRPC procedure slow — can we trace it?"
**Output:** Adds a tRPC middleware that opens an OTel span named for the procedure path and
records duration; child fetch/db spans attach automatically via `@vercel/otel`. The waterfall
shows a per-row query inside a `.map()` — hands off to `n1-hunter` (Rule 7).

**Input:** "Track which release an error came from."
**Output:** Sets `release: env.VERCEL_GIT_COMMIT_SHA` (Zod-validated) in every `Sentry.init`
and the matching `release` in `withSentryConfig`, so the uploaded source maps key to the same release
and incoming errors carry the deploy SHA. Records the release-naming choice in `DECISIONS.md`.

---

## Edge Cases
- **An import you need only runs on Node, not edge** → gate it behind
  `process.env.NEXT_RUNTIME === 'nodejs'` in `instrumentation.ts`; if a route genuinely needs
  the Node runtime, that decision is `edge-runtime-constraints`'.
- **Ad-blockers swallow client events** → enable `tunnelRoute` in `withSentryConfig` to relay
  events through your own domain; do not disable it to "simplify."
- **You want to sample harder to cut cost** → wire the rate from env here, but the policy and
  budget belong to `log-discipline` / `spend-cap` — don't hardcode the new rate, record it.
- **Errors carry user data / bodies** → set `sendDefaultPii: false` and scrub in `beforeSend`;
  what counts as PII and what must never be logged is `log-discipline`'s rule.

---

## References
- `references/sentry-nextjs-edge.md` — the per-runtime Sentry config files, `onRequestError`,
  `withSentryConfig` for release + source maps, the DSN-vs-auth-token (Rule 9) split, and the
  env vars to add to the Zod boundary (Rule 8).
- `references/otel-tracing.md` — the root `instrumentation.ts`, `@vercel/otel` registration,
  edge-vs-Node runtime gating, W3C trace propagation, and the tRPC span middleware pattern.

## Scripts
`scripts/` reserved. A checker that greps for a secret token wearing a `NEXT_PUBLIC_` prefix
and for a hardcoded `tracesSampleRate: 1` across the config files would justify one once the
config layout stabilizes across projects. Empty for now.
