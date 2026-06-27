---
name: product-analytics
description: >
  Instrument product analytics / behavioral events on the edge stack the disciplined way: a
  shared Zod-validated event taxonomy (not stringly-typed names sprinkled at call sites),
  client + server capture over HTTP/fetch (no long-lived Node SDK at the edge), user
  identification by Clerk `userId` with zero PII, server-side funnel/conversion events that
  survive ad-blockers, consent + Do-Not-Track gating, and sampling that never thins the
  funnel. This is PRODUCT instrumentation — distinct from ops observability.
  Use when: "add analytics", "track events", "product instrumentation", "conversion funnel",
  "posthog", "track a signup/purchase event".
  Do NOT use for: ops tracing / error monitoring — OTel spans, Sentry (use observability-setup);
  operational stdout logging, levels (use log-discipline); the experiment flag mechanism itself
  (use feature-flags — this only captures the exposure event).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the "analytics that leaks, drifts, or can't be trusted"
    failure class: stringly-typed event names, PII (email/name) in event props, a private
    analytics key shipped under NEXT_PUBLIC_, no consent/DNT gating, conversion events
    captured only client-side (lost to ad-blockers), and product events conflated with error
    monitoring.
    Baseline observed (clean-room capture).
---

# product-analytics

Product analytics answers *what did the user do* — signed up, started checkout, purchased — so a
funnel and an activation rate exist. That is a different signal from ops observability (*did the
request error, how slow was it*), which `observability-setup` owns via OTel + Sentry. This skill
encodes the failure class where analytics is wired carelessly: event names are bare strings that
drift, PII rides along in props, the private key ships in the client bundle, capture ignores
consent, and the conversion events that matter most fire only client-side where an ad-blocker eats
them. The spine and nine rules live in `../../CLAUDE.md`; this skill leans hardest on Rule 9 (key
server-only, no PII client-side), Rule 8 (event payload and keys are Zod-parsed), and Rule 1 (the
event type traces from one taxonomy).

---

## Non-Negotiable Rules

Analytics defects ship invisibly: the dashboard fills with events and the demo looks great, while
the drifting names, the leaked PII, and the public key only bite weeks later. Hard lines:

- **Never emit a stringly-typed event name.** Every event is a key in the shared Zod taxonomy
  with typed props; capture goes through a typed `capture(event)` so a renamed event or a wrong
  property is a compile error, not a silently mis-named row in the warehouse (Rule 1, Rule 8).
- **Never put PII in an event property or an identify trait.** Identify by the opaque Clerk
  `userId` only — never email, name, address, or raw `ctx.auth` in traits or props. PII in
  analytics is the same breach class `log-discipline` guards against (Rule 9).
- **Never ship the private/personal analytics key to the client.** The *publishable* project
  ingestion key may be `NEXT_PUBLIC_` (like a Sentry DSN); the *private* personal/API key that
  can read or manage the project is server-only and env-validated (Rule 9, Rule 8).
- **Never capture without honoring consent and Do-Not-Track.** Gate every capture behind the
  stored consent state and `navigator.doNotTrack`; where the jurisdiction requires opt-in,
  default to no-capture. A blocked capture is a silent no-op, never a throw.

Refuse these rationalizations: "just call `posthog.capture('user signed up')`"; "put the email
in the event so we can see who it was"; "`NEXT_PUBLIC_POSTHOG_PERSONAL_KEY` is fine, it's only
analytics"; "skip consent, it's just product metrics"; "pipe the errors into PostHog too while
we're here" (that is `observability-setup`).

---

## When to Use

- Standing up product event tracking for a funnel (signup → activation → purchase) on a new app.
- Adding client + server event capture to a feature slice that has a measurable conversion.
- Identifying the logged-in user to analytics without leaking any PII.
- Designing the event taxonomy / naming convention *before* events get sprinkled ad hoc.

## When NOT to Use

- Ops tracing, spans, latency, or error/exception capture → `observability-setup` (OTel + Sentry;
  product events and errors do not share a pipe).
- Operational stdout logging, log levels, redaction of log lines → `log-discipline`.
- The experiment flag / rollout mechanism itself → `feature-flags` (this skill only captures the
  experiment-*exposure* event when a flagged variant is shown).
- A durable, never-sampled who-did-what record → `audit-log-pattern` (analytics is best-effort and
  sampled; an audit entry is neither).
- Validating the app's env surface in general → `env-validation` (this consumes its Zod schema).

---

## Procedure

1. **Define the event taxonomy first, as one shared Zod schema (medium — it is the type root).**
   A discriminated union mapping each event name to its typed props, with `EventName =
   AnalyticsEvent["name"]`. Name events `object.verb_past` (`user.signed_up`, `order.completed`) —
   stable, lowercase, not sentences. Every call site references it; no string literals. See
   `references/event-taxonomy.md`.

2. **Draw the boundary against ops observability before wiring anything (low, high-leverage).**
   Product events go to the PostHog-class destination; errors, traces, and spans go to Sentry/OTel
   via `observability-setup`. Do not capture exceptions as product events or pipe analytics through
   the trace exporter. Record the destination split.

3. **Pick an edge-safe capture transport and env-validate the keys (medium — Rule 8/9).** Client
   uses `posthog-js`; server captures over plain HTTP/fetch (PostHog `/capture`, or `posthog-node`
   flushed immediately) — never a Node SDK that batches behind a long-lived timer the edge runtime
   cannot hold. The publishable key + host and the server-only private key both pass through the
   Zod env schema. See `references/capture-and-consent.md`.

4. **Identify by Clerk `userId`, carrying no PII (high — Rule 9).** Call `identify(ctx.auth.userId)`
   with no email/name traits; on login, `alias`/`identify` the pre-login anonymous id to the
   `userId` so pre-signup events join the same person. Properties stay scalar and PII-free, on
   `log-discipline`'s allowlist discipline. See `references/event-taxonomy.md`.

5. **Gate every capture on consent + DNT (high — privacy/legal cost of being wrong).** Check the
   stored consent state and `navigator.doNotTrack`; where opt-in is required, default capture OFF
   until granted. A blocked capture no-ops. Record the consent model in `DECISIONS.md`. See
   `references/capture-and-consent.md`.

6. **Capture the funnel server-side, not just client-side (medium — trust + ad-blockers).** Fire
   `user.signed_up` and `order.completed` from the tRPC mutation or webhook *after* the DB write, so
   the conversion truth can't be spoofed or lost to an ad-blocker. The client captures UI intent
   (`checkout.started`); the server captures the source-of-truth conversion.

7. **Sample noise, never the funnel (medium — cost lever).** Keep 100% of conversion/funnel events;
   sample high-volume events (`page.viewed`, scroll/heartbeat). Indiscriminate capture is the same
   edge-cost driver `log-discipline` bounds. Record the sampling policy in `DECISIONS.md`.

---

## Composes With

- **Consumes:** `env-validation` — the publishable ingestion key + host and the server-only private
  key are Zod-parsed there (Rule 8); this skill enforces the public/private split (Rule 9).
- **Pairs with:** `observability-setup` — the *sibling ops signal*; it owns OTel traces + Sentry
  errors, this owns product events, and the two never share a pipe (the boundary is the point).
- **Pairs with:** `log-discipline` — its no-PII allowlist and sample-the-noise discipline apply
  identically to event props; an analytics property obeys the same redaction rules as a log field.
- **Pairs with:** `feature-flags` — when a flagged cohort is shown a variant, emit the
  experiment-*exposure* event here; the flag/rollout mechanism stays there.
- **Hands off:** a durable never-sampled change record → `audit-log-pattern`; error/exception
  capture → `observability-setup`.

---

## Baseline failure (observed 2026-06-27)

> Captured by running the task without this skill (a general-purpose agent, no project
> conventions): "add product analytics / event tracking — track signups and purchases, client
> and server, identify the user." The imagined catastrophe (stringly-typed everything, private
> key in `NEXT_PUBLIC_`, browser-only funnel, errors piped into analytics) did **not** occur — a
> capable base model is better than that. A **narrower** failure class was confirmed.

**Observed run.** The agent produced a competent PostHog integration: a typed event registry
(`AnalyticsEvent` + an `EventPropertyMap`), `signup` captured server-side from a Svix-verified
Clerk webhook, `purchase` captured server-side in the tRPC mutation *after* the order commits,
`distinctId` set to the Clerk `userId` on both sides, money kept as integer `amount_cents`, and a
flush-and-swallow discipline so analytics never breaks the sale. Three predicted defects did not
appear: the funnel was captured server-side (not browser-only), the private key stayed server-side
(helped by a repo env-guard, but the agent also chose the public/private split itself), and no
errors were piped into analytics. But three load-bearing disciplines were missing:

```ts
// client provider — PII traits, and capture inits unconditionally on mount
posthog.identify(userId, {
  email: user?.primaryEmailAddress?.emailAddress, // PII into the warehouse (Rule 9)
  name: user?.fullName ?? undefined,              // PII
});
posthog.init(apiKey, { api_host, capture_pageview: false }); // no consent gate, no DNT check
// server webhook: identifyServer(id, { email }) and SignupProperties carries `email?`
// client funnel event, a bare string outside the registry:
posthog?.capture("checkout_started", { item_count, product_ids });
```

**Failure class (confirmed, narrowed).** Not "produces garbage" — "produces a plausible
integration and then leaks PII, skips consent, and validates nothing at runtime." Specifically:
(1) **PII pervasive** — `email` and `name` in `identify` traits (client *and* server) and `email`
in the signup event props, so contact data flows into the analytics warehouse (Rule 9); (2) **no
consent / DNT gating** — the provider inits and captures `$pageview` on mount with no consent
state and no `navigator.doNotTrack` check; (3) **a taxonomy that types but does not validate** —
`EventPropertyMap` is compile-time TS only, with no Zod parse at the capture boundary (Rule 8),
and client funnel events (`checkout_started`, `$pageview`) are bare string literals outside the
registry, so the funnel names still drift. This skill adds the missing rigor: a Zod-parsed
taxonomy as the one capture seam, identify-by-`userId`-with-no-PII, and consent + DNT as the gate.

---

## Examples

**Input:** "Track a signup so it shows in our funnel."
**Output:** After the signup mutation / Clerk webhook writes the user row, the server calls
`capture({ name: "user.signed_up", distinctId: userId, props: { plan, source } })` — validated by
the taxonomy, fired server-side so an ad-blocker can't drop it, with no email in props.
`identify(userId)` carries no PII. The client fires `checkout.started` later, behind consent.

**Input:** "Track a purchase for the conversion funnel."
**Output:** `order.completed` fires from the Stripe webhook handler (server, source-of-truth,
idempotent on the event id) with `{ orderId, totalCents, currency, itemCount }` — money as integer
minor units (Rule 5), no card data, no email. The funnel is `user.signed_up` → `checkout.started`
(client intent) → `order.completed` (server truth).

**Input:** "Wire PostHog into the app."
**Output:** Publishable key + host from the Zod env schema (`NEXT_PUBLIC_POSTHOG_KEY` is the
*publishable* ingestion key, like a Sentry DSN; the personal API key is server-only); a
consent-gated `<PostHogProvider>` Client Component; a typed `capture()` over the shared taxonomy;
`identify` by `userId` on login. Errors still go to Sentry via `observability-setup`, not here.

---

## Edge Cases

- **Anonymous user before login** → capture against the library's anonymous/device id, then
  `alias`/`identify` it to the Clerk `userId` on login so pre-signup events join the same person;
  never mint a per-event random id.
- **User in an opt-in-consent jurisdiction** → default capture OFF until consent is granted;
  honor `navigator.doNotTrack` regardless of jurisdiction. The consent state is the gate, not an
  afterthought — record the model in `DECISIONS.md`.
- **Ad-blocker drops client events** → fire the source-of-truth funnel events (`user.signed_up`,
  `order.completed`) server-side, and optionally proxy ingestion through a first-party route; never
  rely on the browser for conversion truth.
- **You want error rate in the funnel dashboard** → that is an ops signal; keep errors in
  Sentry/`observability-setup` and link to them, rather than re-capturing exceptions as product
  events and blurring the boundary.

---

## References

- `references/event-taxonomy.md` — the shared Zod event registry (discriminated union), the
  `object.verb_past` naming convention, the typed `capture()` that makes a drifting name a compile
  error, identify-by-`userId`-without-PII, and the anonymous→user alias on login.
- `references/capture-and-consent.md` — the edge-safe transport (client `posthog-js` + server
  `/capture` over fetch), the publishable-vs-private key split (Rule 9) through the Zod env boundary
  (Rule 8), consent + DNT gating, server-side funnel capture, the sampling policy, and the explicit
  boundary against `observability-setup`.

## Scripts

`scripts/` is reserved. A signal that would justify one: a static check that greps the diff for a
bare `capture("…")` / `posthog.capture('…')` string literal outside the taxonomy module, for an
`email`/`name`/`phone` key inside capture props or identify traits, or for a private analytics key
wearing a `NEXT_PUBLIC_` prefix. Until that pattern recurs across projects, this skill stays
script-free.
