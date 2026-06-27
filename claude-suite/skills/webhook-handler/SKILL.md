---
name: webhook-handler
description: >
  The generic inbound-webhook pattern for the edge stack, generalized from the Clerk/Svix
  instance to any provider (Stripe, GitHub, Resend, …): read the raw body in a route handler,
  verify the signature with a constant-time check BEFORE parsing, Zod-parse the verified-but-
  unknown payload while tolerating unknown/added fields, dedup and process idempotently keyed
  on the provider event id, and fast-ack 2xx while deferring heavy work. Encodes Rules 8/9/2
  at the one boundary that is a public write endpoint until proven authentic.
  Use when: "add a webhook endpoint", "handle a stripe webhook", "github webhook",
  "verify a webhook signature", "process webhook events idempotently", "inbound webhook".
  Do NOT use for: wiring Clerk auth + its Svix webhook specifically (use clerk-auth-flows),
  or Stripe API/event-object specifics beyond the transport (use stripe-integration).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Generalizes clerk-auth-flows' Svix webhook into the provider-agnostic
    pattern. Encodes the inbound-webhook failure class: parse-before-verify, req.json() losing
    the raw bytes, non-idempotent processing, NEXT_PUBLIC/`===` secret handling. Baseline observed (clean-room capture).
---

# webhook-handler

The provider-agnostic shape of an inbound webhook on the edge runtime. A webhook endpoint is a
**public write surface** — anyone on the internet can POST to it — so it is only safe once the
signature is verified, the payload is Zod-parsed, and processing is idempotent. This skill lifts
`clerk-auth-flows`' Svix handler into a pattern any provider (Stripe, GitHub, Resend) drops into:
verify → parse → dedup → fast-ack.

Spine and the nine rules live in `../../CLAUDE.md`. This is the concrete procedure behind Rule 8
(validated boundaries), Rule 9 (server-only secrets), and Rule 2 (an unverified body is
unauthenticated) at the webhook boundary; it does not restate them.

---

## Non-Negotiable Rules

The defect ships in code that compiles and returns 200, so these are hard lines:

- **Never parse or act on a webhook body before verifying its signature.** The order is
  verify → parse → act. An endpoint that reads `evt.type` before `verify()` is a public,
  unauthenticated write API for anyone who can guess the shape.
- **Never read the body as JSON when verification needs the raw bytes.** Read `req.text()` (or
  `arrayBuffer()`) once; `req.json()` re-serializes and changes whitespace/key order, breaking
  the HMAC. The stream is consumable once — capture raw, then parse the string.
- **Never process a webhook non-idempotently.** Providers retry on any non-2xx and re-deliver
  duplicates; key every effect on the provider **event id** (dedup row + `onConflictDoNothing`/
  upsert) so a replay is a no-op, not a double charge or duplicate row.
- **Never put the signing secret in `NEXT_PUBLIC_*` or compare signatures with `===`.** The
  secret is server-only and Zod-validated at the env boundary (Rules 9/8); signature comparison
  is constant-time (the provider SDK's verifier, or a Web Crypto HMAC compare), never `==`.

Refuse these rationalizations: "I'll parse it to see the type, then verify"; "`req.json()` is
fine, the signature still matches"; "the provider won't send the same event twice"; "the secret
in `NEXT_PUBLIC_` is OK, it's just a webhook"; "string equality on the signature is good enough."

---

## When to Use

- Adding an inbound webhook endpoint for any provider (Stripe, GitHub, Resend, Twilio, …).
- Hardening an existing handler that parses before verifying, isn't idempotent, or trusts the body.
- Generalizing the Clerk/Svix handler to a second provider with a different signature scheme.

## When NOT to Use

- Wiring Clerk auth, `clerkMiddleware`, and its specific Svix webhook → `clerk-auth-flows`
  (this skill is the pattern that one is an instance of).
- Stripe API surface / event-object semantics beyond the transport → `stripe-integration`.
- Designing the `webhook_events` dedup table or the synced entity's columns → `schema-design`.
- Authoring the shared Zod payload schema itself → `zod-schema-library`.

---

## Procedure

1. **Validate the signing secret at the env boundary first (high — Rules 8/9).** Add the provider
   secret (`STRIPE_WEBHOOK_SECRET`, `GITHUB_WEBHOOK_SECRET`, …) to the Zod server-env so a missing
   secret fails at boot; never `NEXT_PUBLIC_*`, never bare `process.env`. See `references/verify-and-raw-body.md`.

2. **Build a route handler at the edge and read the RAW body (high).** A webhook is a Web `Request`
   handler (`app/api/webhooks/<provider>/route.ts`), **not** a tRPC procedure — tRPC parses JSON and
   the bytes the signature covers are lost. Read `req.text()` once and pull the signature header(s).

3. **Verify the signature with a constant-time check BEFORE parsing (high — Rule 2/8).** Use the
   provider SDK's verifier (at the edge: Stripe's **async** `constructEventAsync` with
   `createSubtleCryptoProvider()`, Svix `verify`, or a Web Crypto HMAC + constant-time compare) over
   the raw body and a checked timestamp (reject stale to block replay). On failure return 4xx and
   stop — never 2xx an unverified call. See `references/verify-and-raw-body.md`.

4. **Zod-parse the verified-but-`unknown` payload, tolerating unknown fields (high — Rule 8).**
   `safeParse` the still-`unknown` body against a discriminated union on the event type; model only
   what you persist and let added fields pass (don't `.strict()`), so a new provider field never
   500s the endpoint. Unhandled type → clean 4xx/2xx-ignore, not a throw. See `references/idempotency-and-defer.md`.

5. **Dedup and process idempotently, keyed on the event id (high).** Record the event id in a
   `webhook_events` table (`insert … onConflictDoNothing`); if already present, ack and return. All
   effects are idempotent writes (upsert on a natural id). Hand the dedup mechanics to
   `idempotency-keys`. See `references/idempotency-and-defer.md`.

6. **Fast-ack 2xx, defer heavy work (medium).** Ack as soon as the event is durably recorded; do
   expensive work idempotently — inline if cheap, else enqueue — so you stay inside the provider's
   ack timeout and retries remain safe. See `references/idempotency-and-defer.md`.

7. **Return correct statuses and record forks (low).** 4xx on bad signature/malformed, 2xx after a
   successful (or already-seen) event. Record the provider, its signature scheme, and any Web-Crypto
   fallback in `DECISIONS.md`; then hand the endpoint to `security-pass`.

---

## Composes With

- **Consumes:** `env-validation` (the server-only signing secret at the Zod env boundary, Rule 9);
  `zod-schema-library` (the shared payload schema, Rule 8).
- **Pairs with:** `idempotency-keys` (idempotent event processing keyed on the provider event id —
  the dedup table and the "process once" guarantee).
- **Generalizes:** `clerk-auth-flows` (its Svix verify→parse→upsert webhook is the instance this
  pattern abstracts; use that skill for Clerk-specific wiring).
- **Hands off:** the `webhook_events` / synced-entity tables → `schema-design`; provider-specific
  event semantics → `stripe-integration`; the finished endpoint's threat-model + headers →
  `security-pass`.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent told to implement as a
> typical dev would, forbidden from reading `.claude/`/`CLAUDE.md`). The imagined catastrophe
> (`req.json()` destroying the raw bytes, parse-before-verify, a `NEXT_PUBLIC_` secret, `===` on the
> signature) did **not** occur — a capable base model already knows the transport. A **narrower**
> failure class was confirmed.

**Observed run.** Prompt: "add a Stripe webhook for `checkout.session.completed` and mark the order
paid." The agent produced a competent transport: `req.text()` (not `req.json()`), the `stripe-signature`
header, `stripe.webhooks.constructEvent` (constant-time) before any branching, secrets kept
server-only, 400 on verify failure. But the disciplines past the transport were missing:

```ts
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;        // bare process.env, not the Zod env (Rule 8)
// ...
} catch (err: any) { /* ... */ }                                 // any (Rule 1)
const session = event.data.object as Stripe.Checkout.Session;    // type ASSERTION, not a runtime parse (Rule 8)
const orderId = session.metadata?.orderId;                       // trusted straight from the payload
if (orderId) {
  await db.update(orders).set({ status: "paid", paidAt: new Date() }).where(eq(orders.id, orderId));
}                                                                // no event-id dedup; paidAt re-stamped on every retry
```

Its own note: *"if `constructEvent` throws it's not really from Stripe, so I return 400 … flip the
order's status to paid … return 200 so Stripe stops retrying."* — the verified body is trusted via an
`as` cast with **no `safeParse`** (Rule 8), the secret is read through bare `process.env.X!` instead of
the validated env boundary (Rule 8/9), and there is **no `webhook_events` dedup keyed on the event
id**: the `status` write happens to converge, but `paidAt` is re-stamped on every duplicate delivery
and any non-convergent effect (an email, a credit, an `insert`) would double-apply.

**Failure class (confirmed, narrowed).** Not "produces an unverified public write endpoint" — the base
model gets verify-before-act and raw-body right. It then **asserts** the payload's type instead of
Zod-parsing it, reads the secret outside the validated env boundary, and processes **without an
event-id dedup**, so provider retries aren't idempotent. This skill adds the missing rigor: a
`safeParse` over the verified body (tolerating added fields), the secret behind `env-validation`, and
a `webhook_events` upsert keyed on the event id with fast-ack + defer.

---

## Examples

**Input:** "Add a Stripe webhook for `checkout.session.completed`."
**Output:** `STRIPE_WEBHOOK_SECRET` added to the Zod server-env; route at
`app/api/webhooks/stripe/route.ts` reads `req.text()` + the `stripe-signature` header, calls
`stripe.webhooks.constructEventAsync(raw, sig, secret, undefined, createSubtleCryptoProvider())`
(constant-time, edge-safe, throws → 400), `safeParse`s the event into a discriminated union,
`insert`s the event id into `webhook_events`
`onConflictDoNothing` (already-seen → 200 early), fulfills the order via an upsert keyed on
`session.id`, returns 200. Stripe-specific event semantics handed to `stripe-integration`.

**Input:** "Handle GitHub `push` webhooks to trigger a sync."
**Output:** `GITHUB_WEBHOOK_SECRET` in env; route reads raw body + `x-hub-signature-256`, recomputes
`sha256=` HMAC with Web Crypto and `timingSafeEqual`-compares (400 on mismatch), Zod-parses the
delivery (unknown fields tolerated), dedups on the `x-github-delivery` id, enqueues the sync job and
fast-acks 202.

**Input:** "This Resend webhook handler parses then verifies — fix it."
**Output:** Reorders to verify→parse, switches `req.json()` to `req.text()`, moves the secret behind
the Zod env boundary, adds the `webhook_events` dedup keyed on the event id, and returns 4xx on a bad
signature instead of swallowing it.

---

## Edge Cases

- **Events arrive out of order or before the referenced resource exists** (a `*.updated` before the
  `*.created`) → upsert and make handlers order-tolerant; never assume delivery order.
- **Processing exceeds the provider's ack timeout** (e.g. Stripe's seconds-level window) → durably
  record the event, fast-ack 2xx, and defer the work to a queue; retries stay safe because effects
  are idempotent.
- **The provider rotates its signing secret** → accept both the old and new secret during the
  rotation window (try each verifier), then drop the old; record the window in `DECISIONS.md`.
- **A polyfill gap means the SDK verifier won't run at the edge** → verify with Web Crypto
  `crypto.subtle` HMAC + `timingSafeEqual` over the documented signed payload, reject stale
  timestamps, and record the deviation in `DECISIONS.md` (mirrors `clerk-auth-flows`).

---

## References

- `references/verify-and-raw-body.md` — raw-body access in an edge route handler (why not tRPC),
  per-provider signature schemes (Stripe / Svix / GitHub HMAC), constant-time comparison, the
  replay-window timestamp check, and the env-boundary secret.
- `references/idempotency-and-defer.md` — the `webhook_events` dedup table keyed on event id,
  idempotent upserts, tolerating unknown/added fields in Zod, `safeParse` status mapping, and the
  fast-ack + defer pattern.

## Scripts

- `scripts/webhook-lint.mjs` — heuristic static check over a webhook route file: flags `req.json()`
  in a handler (raw body needed), a signing secret under `NEXT_PUBLIC_*` or read via bare
  `process.env`, and an `any`-typed event. Exit code = number of findings (0 ≠ "verified-and-
  idempotent"; verify-before-parse ordering and dedup stay a manual `rule-audit` check). See
  `scripts/README.md` for scope and limits.
