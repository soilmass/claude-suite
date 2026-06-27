---
name: stripe-integration
description: >
  Integrate Stripe on the edge runtime the decided way: an edge-safe Stripe client over the
  Fetch/Web-Crypto HTTP path (no Node-only deps), Checkout Sessions and PaymentIntents whose
  amounts are derived server-side (never from the client), and a webhook that verifies the
  signature with the ASYNC SubtleCrypto verifier, Zod-parses the event, and processes it
  idempotently keyed on the Stripe event id. Maps subscription lifecycle into Drizzle and
  stores Stripe's minor-unit amounts straight into the integer-minor-units money model.
  Specializes the generic inbound-webhook pattern for Stripe; honors Rules 2, 5, 8, 9.
  Use when: "add stripe", "stripe checkout", "stripe subscription", "stripe webhook",
  "handle a payment", "billing".
  Do NOT use for: how money is stored, formatted, or split (use money-modeling); the generic
  non-Stripe inbound-webhook verify-parse-upsert plumbing (use clerk-auth-flows); designing
  the non-payment domain tables (use schema-design).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the Stripe-on-edge failure class: a Node-only Stripe client
    that dies at the edge, a webhook verified with the synchronous (Node-crypto) verifier or
    not at all, a checkout amount trusted from the client, a non-idempotent handler that
    double-applies on Stripe's retries, and money read off the event as a float. Baseline
    section is an observed transcript (2026-06-26).
---

# stripe-integration

The build-loop skill for putting Stripe on the *edge* stack without tripping any of its four
quiet failure modes: a Node-only SDK path that throws under the Workers runtime, a webhook
that is unverified (or verified with the wrong, synchronous verifier), a charge amount that
trusts whatever the client posted, and a handler that is not idempotent so Stripe's retries
double-grant access or double-record a purchase. It specializes the generic inbound-webhook
pattern (reference instance: `clerk-auth-flows`) for Stripe, and defers *how money is stored*
to `money-modeling`.

The spine and the nine inviolable rules live in `../../CLAUDE.md`; this skill leans hardest on
Rule 9 (the secret and webhook keys are server-only), Rule 8 (verify then Zod-parse the event),
Rule 5 (Stripe minor units land as integer minor units, never a float), and Rule 2 (the
checkout is created for, and reconciled against, a resource owned by `ctx.auth.userId`).

---

## Non-Negotiable Rules

Every one of these ships in code that compiles, deploys, and returns 200 — which is exactly
why they are hard lines, not suggestions:

- **Never trust a client-sent amount or price.** The amount to charge is derived server-side
  from your own DB (a `priceId`/SKU the client *names*, never a number it *sends*). A Checkout
  Session or PaymentIntent built from `input.amount` is an open cash register (Rule 2/8).
- **Never skip — or downgrade — webhook signature verification.** Verify every event with the
  webhook signing secret over the **raw** request body, using the **async** verifier
  (`constructEventAsync` + a SubtleCrypto provider) because the edge runtime has no Node
  `crypto`. An unverified webhook is a public endpoint that grants subscriptions to anyone.
- **Never process an event non-idempotently.** Stripe retries on any non-2xx and can deliver
  duplicates; key processing on the Stripe **event id**, record it, and no-op on replay so a
  subscription is never double-activated and a purchase never double-recorded.
- **Never store a Stripe amount as a float, and never put a Stripe secret client-side.** Stripe
  amounts are already integer minor units — store them as such with their `currency`
  (Rule 5, via `money-modeling`). `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` are server-only
  and Zod-validated at the env boundary; only `pk_*` may be public (Rule 9/8).

Refuse these rationalizations: "the client already knows the price, just pass it through";
"signature check is overhead, the URL is unguessable"; "Stripe won't really send the same
event twice"; "`constructEvent` works fine locally so it's fine on the edge"; "amount is just
a number, store it however."

---

## When to Use

- Adding Checkout, a PaymentIntent, or a Payment Element to take a one-off payment.
- Standing up a subscription (`Pro` plan, seats, metered) and syncing its lifecycle to Drizzle.
- Building or fixing the Stripe webhook endpoint on the edge runtime.
- Reconciling Stripe amounts (`amount_total`, `amount`, invoice line items) into your schema.

## When NOT to Use

- Deciding how money is stored, branded, rounded, split, or formatted → `money-modeling`
  (this skill consumes its column type and `currency` companion; it never re-decides them).
- The generic, non-Stripe inbound webhook (Svix-verify → Zod-parse → upsert) → `clerk-auth-flows`
  is the reference instance of that pattern; this skill is the Stripe specialization.
- Validating the `STRIPE_*` env vars in isolation → `env-validation` owns the typed boundary.
- Designing the non-payment domain tables the purchase relates to → `schema-design`.
- Diagnosing why a Node-only dep breaks under the edge runtime → `edge-runtime-constraints`.

---

## Procedure

1. **Validate the Stripe env at the boundary first (high — Rule 9/8).** Add `STRIPE_SECRET_KEY`
   and `STRIPE_WEBHOOK_SECRET` as server-only vars and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` as
   the one public var in the Zod env schema; no secret ever rides `NEXT_PUBLIC_*`. Hand the
   schema work to `env-validation`. See `references/edge-client-and-checkout.md`.

2. **Build the edge-safe Stripe client once (high).** Construct `Stripe` with the Fetch HTTP
   client (`Stripe.createFetchHttpClient()`) and an explicitly **pinned** `apiVersion`, in a
   single server-only module. The default client uses Node `http`, which the edge runtime does
   not have. See `references/edge-client-and-checkout.md`.

3. **Model subscription/payment state in Drizzle, amounts as minor units (medium — Rule 5).**
   A `stripe_customer_id` on the user, a `subscriptions` table (status pgEnum,
   `stripe_subscription_id`, `price_id`, `current_period_end timestamptz`), and a `payments`
   table storing `amount_minor`/`currency` straight from the event. Money columns are
   `money-modeling`'s call; time is `timestamptz` (Rule 6). See `references/subscription-and-money.md`.

4. **Create the Checkout Session / PaymentIntent server-side with a server-derived amount
   (high — Rule 2/8).** A thin `protectedProcedure` looks up the price by the client's named
   `priceId`/SKU in your DB (or uses a Stripe `price_*` id), attaches the Stripe customer for
   `ctx.auth.userId`, and creates the session. The client never sends an amount. See
   `references/edge-client-and-checkout.md`.

5. **Write the webhook as verify(async) → Zod-parse → idempotent process (high — Rule 8).**
   Read the **raw** body with `req.text()`, `constructEventAsync` it with a SubtleCrypto
   provider, `safeParse` the event with a discriminated union, then insert the event id into a
   `processed_stripe_events` table `onConflictDoNothing` and skip if already present. Return
   4xx on bad signature, 2xx only after the write commits. See `references/webhooks-and-idempotency.md`.

6. **Map the subscription lifecycle into your DB (medium).** Handle `checkout.session.completed`,
   `customer.subscription.created|updated|deleted`, and `invoice.paid|payment_failed`; upsert
   the subscription row keyed on `stripe_subscription_id` and translate Stripe status into your
   pgEnum. Treat Stripe as the source of truth; reconcile, do not guess. See
   `references/subscription-and-money.md`.

7. **Reconcile amounts and record forks.** Store `amount_total`/`amount` as `integer` minor
   units with the event's `currency` — no division on ingest (zero-decimal currencies like JPY
   arrive as whole units; the exponent lives in `money-modeling`). Record the price-source and
   subscription-status mapping in `DECISIONS.md`; then run `rule-audit` and `security-pass`.

---

## Composes With

- **Consumes:** `money-modeling` — it owns the `amount_minor`/`currency` column type and the
  branded `Money`; this skill only writes Stripe's already-minor amounts into it. `env-validation`
  — the typed `STRIPE_*` boundary. `schema-design` — the non-payment tables a purchase relates to.
- **Specializes:** `clerk-auth-flows` — the reference instance of the inbound-webhook
  verify→parse→idempotent-upsert pattern; this skill applies it to Stripe (Stripe signatures +
  the async edge verifier instead of Svix).
- **Pairs with:** `audit-log-pattern` — record a money-moving event in the same transaction as
  the state change; `edge-runtime-constraints` — confirms the client path is edge-safe;
  `vertical-slice` — builds the ownership-checked procedure that starts the checkout.
- **Hands off:** adding the payment tables to a live schema → `migration-author`; the resolved
  price-source and status-mapping forks → `DECISIONS.md`; the finished surface → `security-pass`.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent told to implement as
> a typical dev would, with no project conventions): "add Stripe checkout + a subscription
> webhook to our Next.js edge app with Drizzle." The imagined catastrophe (Node client,
> unverified webhook, client-trusted amount, float money) did **not** occur — a capable base
> model is better than that. A **narrower** failure class was confirmed.

**Observed run.** The agent produced a competent integration: an edge Stripe client with
`Stripe.createFetchHttpClient()`, verification via `constructEventAsync`, a checkout that takes
only a product **enum** (`pro_monthly` / `credit_pack`) and resolves the price server-side,
`amount_total` stored as integer cents, and `current_period_end` as `timestamptz`. It got the
headline items right — but the disciplines that need rigor were skipped:

```ts
// env: raw process.env with non-null assertions, no Zod boundary (Rules 8, 9, 1)
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
export const STRIPE_PRICES = { proMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY! };
// verified === trusted: the event is NEVER Zod-parsed; casts bridge it to the DB
status: sub.status as SubStatus,
stripeCustomerId: sub.customer as string,
// "idempotency" = per-handler natural-key dedup, not an event-id ledger; ordering unhandled
```

The verified event is read straight off the SDK types — no Zod parse (Rule 8) and a stack of
`as string` / `as SubStatus` casts (Rule 1) carry Stripe's shapes into Drizzle. Secrets and
price ids are `process.env.X!` with no Zod env boundary (Rules 8/9; `!` breaks Rule 1).
Idempotency is reinvented per-handler from natural keys (unique session id, subscription upsert)
rather than one `processed_stripe_events` ledger keyed on `event.id` — leaving out-of-order
events unhandled (a stale `subscription.updated` overwrites newer state).

**Failure class (confirmed, narrowed).** Not "produces garbage" — "produces a plausible,
largely-correct Stripe integration and then skips the parts that need proof": the Zod parse of
the verified event, the typed env boundary, the event-id idempotency ledger with ordering, and
the unbroken type chain (casts instead of inference). This skill supplies exactly that missing
rigor: env-validated secrets, verify→Zod-parse→idempotent-on-event-id, and Stripe amounts
written through `money-modeling` rather than cast in.

---

## Examples

**Input:** "Let a signed-in user subscribe to our $12/mo Pro plan."
**Output:** A `protectedProcedure` `billing.createCheckout` that finds-or-creates the Stripe
customer for `ctx.auth.userId`, then creates a `mode: "subscription"` Checkout Session from the
**server-held** `price_*` id (the client sends only `{ plan: "pro" }`, never an amount), and
returns the session URL. The webhook handles `checkout.session.completed` +
`customer.subscription.created` by upserting a `subscriptions` row keyed on
`stripe_subscription_id` with `status: "active"` and `current_period_end` as `timestamptz` —
idempotent on the event id. No amount crosses from the client.

**Input:** "Sell a one-off $25 credit pack."
**Output:** `billing.createCheckout` in `mode: "payment"` with the server-resolved SKU price; on
`checkout.session.completed` the webhook inserts a `payments` row with
`amount_minor: session.amount_total` (already `2500`) and `currency: session.currency` straight
into the `money-modeling` column — no `/ 100`, paired with its currency, recorded in the same
transaction as the credit grant (`audit-log-pattern`).

**Input:** "Our webhook keeps double-granting Pro when Stripe retries."
**Output:** Add a `processed_stripe_events(id text primary key)` table; at the top of the
handler `insert(...).values({ id: event.id }).onConflictDoNothing()` and `return 200` early when
the row already existed — the lifecycle write becomes a no-op on replay.

---

## Edge Cases

- **`constructEvent` (sync) throws `Cannot read properties of undefined` / crypto errors on the
  edge** → switch to `await stripe.webhooks.constructEventAsync(raw, sig, secret, undefined,
  Stripe.createSubtleCryptoProvider())`; the sync verifier needs Node `crypto`, the async one
  uses Web Crypto. See `references/webhooks-and-idempotency.md`.
- **Events arrive out of order** (a `subscription.updated` before `created`, or a stale update
  overtaking a newer one) → upsert keyed on `stripe_subscription_id` and only apply an update
  whose `event.created`/`current_period_end` is newer; treat Stripe's current object as truth,
  never blindly overwrite with an older event.
- **A zero-decimal currency** (JPY: `amount_total: 1200` means ¥1200, not ¥12.00) → store the
  integer as-is; never `/ 100`. The per-currency exponent is `money-modeling`'s job at display.
- **The Stripe customer/subscription exists but the local row was lost** (failed earlier write,
  manual dashboard change) → reconcile from Stripe as the source of truth on the next event or
  via a `subscriptions.retrieve`; do not assume the local row is authoritative.

---

## References

- `references/edge-client-and-checkout.md` — the edge-safe `Stripe` client (Fetch HTTP client,
  pinned `apiVersion`), the `STRIPE_*` env boundary, and creating Checkout Sessions /
  PaymentIntents server-side with a server-derived amount (subscription and one-off).
- `references/webhooks-and-idempotency.md` — the webhook route end to end: raw body,
  `constructEventAsync` + SubtleCrypto, the Zod discriminated-union event schema, the
  `processed_stripe_events` idempotency table, and the 4xx/2xx contract.
- `references/subscription-and-money.md` — the Drizzle subscription/payment schema, the status
  pgEnum and lifecycle mapping (`checkout.session.completed`, `customer.subscription.*`,
  `invoice.*`), and reconciling Stripe minor units into the `money-modeling` columns.

## Scripts

`scripts/` is reserved (`scripts/.gitkeep`). A signal that would justify one: a static check
grepping the Stripe webhook route for `constructEvent(` without the async `Async` suffix, for
`req.json()` before verification, or for a `new Stripe(` missing `httpClient` — each a
mechanically detectable edge/verification defect. Until those patterns stabilize, this stays a
manual `rule-audit` / `security-pass` check.
