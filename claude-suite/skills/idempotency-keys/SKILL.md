---
name: idempotency-keys
description: >
  Make effectful mutations and webhook processing safe to retry on the edge stack: an
  Idempotency-Key envelope, a request fingerprint, and a dedup store (a unique-keyed Drizzle
  row or edge KV) that claims a key atomically, runs the side effect once, persists the
  result, and returns that stored result verbatim on every replay. Covers which operations
  MUST be idempotent (payments, state transitions, webhook delivery), the
  `onConflictDoNothing`/`DoUpdate` upsert vs. a read-after-write guard, fingerprint conflicts
  (409 on key reuse with a different body), and TTL/expiry of keys. The retry is the rule, not
  the exception — networks redeliver, clients retry, queues re-fire.
  Use when: "idempotency key", "safe to retry", "deduplicate requests", "exactly once",
  "prevent double charge", "webhook processed twice".
  Do NOT use for: receiving/verifying the webhook itself — signature, parsing, routing (use
  webhook-handler); the reusable procedure builder the claim hangs off (use trpc-middleware);
  batch-scale resumable idempotent backfills (use data-backfill).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the at-least-once-without-dedup failure class: an effectful
    mutation (charge, state transition, webhook) that runs twice on retry because there is no
    idempotency key, no atomic claim (check-then-act race), no fingerprint, and no stored
    replay result. Baseline observed (clean-room capture).
---

# idempotency-keys

The build-loop skill for the one property a retried mutation must have: it produces the *same
single outcome* no matter how many times it runs. Given "make this charge safe to retry" or "our
webhook fires twice," it produces an Idempotency-Key envelope, an atomically-claimed dedup store,
and a stored-result replay — so the second and tenth delivery observe the first outcome instead of
charging the card again. At-least-once delivery is the network's default; exactly-once *effect* is
something you build.

The spine and nine inviolable rules live in `../../CLAUDE.md`. This skill leans on Rule 8 (key and
body Zod-parsed at the boundary), Rule 2 (keys scoped per caller), Rule 5 (the canonical effect it
guards is money), and the edge constraint (the claim is an atomic unique-row insert, not a lock
held across a connection).

---

## Non-Negotiable Rules

A missing dedup is invisible until the retry: the first call works, the demo passes, and the
double-charge only appears when a real client's network blips. Hard lines:

- **Never let a retryable effect run twice.** Every non-idempotent effect — charge, refund, money
  move, state transition, notification, webhook — is claimed against a dedup store *before* it runs.
- **Never claim a key with a non-atomic check-then-act.** Read-then-insert is a race two concurrent
  retries both win. Claim with a UNIQUE constraint + `onConflictDoNothing`; the write that hit 0 rows lost.
- **Never accept a key without fingerprinting the body.** A key reused with a *different* payload is a
  client bug — return 409, never silently serve the old result or overwrite. Validate both with Zod (Rule 8).
- **Never give keys infinite life or store the result outside its claim.** Keys carry an `expires_at`
  TTL (~24h, the provider window); the result is written to the same row so a replay returns it verbatim.

Refuse these rationalizations: "the client won't double-submit"; "I'll just check-then-insert,
it's basically atomic"; "same key, who cares if the body changed"; "we can expire keys later."

---

## When to Use

- Adding an effectful mutation that a client, queue, or proxy could deliver more than once.
- Processing payments/refunds (the canonical case) or a state transition that must fire once.
- Deduplicating webhook redelivery by event id, or a "create" that must not duplicate rows on retry.

## When NOT to Use

- Receiving the webhook — signature verification, parsing, routing → `webhook-handler` (this skill only dedupes the event once handed over).
- Building the reusable `protectedProcedure`/middleware the claim attaches to → `trpc-middleware`.
- A large resumable backfill whose idempotency is keyset/marker-based at batch scale → `data-backfill`.
- A naturally idempotent write (full-overwrite PUT, delete-by-id, set X=Y) → no key needed; don't add ceremony.

---

## Procedure

1. **Inventory which operations require a key (medium-interrogation).** Any non-idempotent *effect*
   — payment, state transition, notification, external provisioning, webhook — needs one; pure reads
   and naturally-idempotent writes do not. Naming them wrong is a silent double-charge. See
   `references/when-and-fingerprint.md`.

2. **Define the envelope and fingerprint the request (Rule 8).** Accept a client-supplied
   `Idempotency-Key`, SHA-256 the *canonical* body with Web Crypto (`crypto.subtle` — edge-safe), and
   Zod-parse both — the fingerprint is what turns "same key, different body" into a 409. See
   `references/when-and-fingerprint.md`.

3. **Model the dedup store as a unique-keyed row at the edge.** A `request_idempotency` Drizzle table
   keyed `(scope_id, idempotency_key)` UNIQUE (Rule 2 scopes keys per caller), with a `fingerprint`, a
   `pending`/`completed` status, a `response` jsonb, and `expires_at timestamptz` (Rule 6) — no lock
   across a connection. See `references/dedup-store.md`.

4. **Claim the key atomically before the effect.** Insert with `onConflictDoNothing`; if it claimed 0
   rows the key exists — branch: fingerprint mismatch → 409, `completed` → return the stored result,
   `pending` → tell the caller to retry. Replaces the check-then-act race. See `references/dedup-store.md`.

5. **Run the effect once, pass the key through, persist the result.** For an external effect, forward
   the same key to the provider (Stripe `Idempotency-Key`), perform it, then `update` the row to
   `completed`. For a pure DB write, fold the `onConflictDoNothing` upsert and the dedup write into
   one guarded statement set (CTE / `db.batch`) — not an interactive transaction, which the edge
   HTTP driver rejects (`edge-transactions`). See `references/safe-retry.md`.

6. **Return the stored prior result on every replay.** A `completed` key returns the exact original
   response, not a recomputation — so the caller can retry forever and observe one outcome; a
   read-after-write guard returns the already-created row. See `references/safe-retry.md`.

7. **Expire keys on a TTL, and dedupe webhooks by event id.** Set `expires_at` to the provider window
   (~24h), sweep expired rows, record the window in `DECISIONS.md`. For webhooks, use the provider
   event id (`evt_…`) as the key, process once, ack 200 even on a duplicate. See `references/safe-retry.md`.

---

## Composes With

- **Pairs with:** `webhook-handler` — it verifies, parses, and routes the event; this skill dedupes that event by its id so a redelivery is acked 200 without re-processing.
- **Pairs with:** `trpc-middleware` — the atomic claim is naturally a `withIdempotency` middleware on effectful procedures, keeping the procedure thin.
- **Pairs with:** `money-modeling` — payments are the canonical effect this guards; the stored amount is integer minor units (Rule 5) and the key is forwarded to the provider.
- **Pairs with:** `data-backfill` — the same idempotency principle at batch scale (keyset/marker guards, not a per-request key); cross-reference, don't duplicate.
- **Hands off:** adding the `request_idempotency` table (and any per-table unique key) to a live schema → `migration-author`.

---

## Baseline failure (observed 2026-06-26)

> Captured clean-room: a general-purpose agent told to write the charge as a normal developer from
> general knowledge, explicitly *not* reading this repo's `.claude/` or `CLAUDE.md`. The imagined
> catastrophe (no key, float money, check-then-act) did NOT occur — a capable base model is better
> than that. A **narrower** failure class was confirmed.

**Observed run.** Prompt: "add a tRPC mutation that charges a customer; make it safe to retry." The
agent produced a competent design: an atomic `onConflictDoNothing` claim on a UNIQUE
`idempotency_key`, the same key forwarded to Stripe, integer minor-units money, `timestamptz`,
ownership-scoped reads. But its DB claim does not serialize the in-flight effect — on a still-`pending`
row it falls through and calls the provider *again*, leaning entirely on Stripe's own idempotency:

```ts
if (existing.status !== "pending") return existing;
// else: falls through and calls stripe.paymentIntents.create() a second time.
```

Its "fingerprint" was an ad-hoc field compare (`amount` + `customerId`; `currency` unchecked), not a
canonical hash; there was **no key TTL** (rows live forever) and no webhook event-id path.

**Failure class (confirmed, narrowed).** Not "double-charges" — "offloads all real dedup to the
payment provider." The local claim is advisory, so the moment the effect is *not* a provider with its
own idempotency — a state transition, a notification, an internal money move — concurrent retries
double-fire. This skill makes the DB claim authoritative (a `pending` row returns *retry*, never a
second effect), fingerprints the whole validated body, and bounds keys with a TTL.

---

## Examples

**Input:** "Add a tRPC mutation that charges a customer; make it safe to retry."
**Output:** A `protectedProcedure` that Zod-parses input + `Idempotency-Key`, fingerprints the body,
claims `(ctx.auth.userId, key)` via `onConflictDoNothing`; on a fresh claim it forwards the key to
the provider, charges, and updates the row to `completed`; on a replay returns the stored response;
on a fingerprint mismatch throws `CONFLICT`.

**Input:** "Our Stripe webhook sometimes processes the same event twice."
**Output:** After `webhook-handler` verifies and parses, dedupe on `event.id` (`scope =
"webhook:stripe"`) with a saga: claim atomically via `onConflictDoNothing`, return the stored
result if the claim conflicts, otherwise process and persist — releasing the claim on failure (no
interactive transaction at the edge). Ack 200 either way so a redelivery short-circuits without
re-running the effect.

**Input:** "Retrying a create-order request creates duplicate orders."
**Output:** Carry `idempotency_key` on `orders`, `UNIQUE (user_id, idempotency_key)`;
`insert(...).onConflictDoNothing(...).returning()` — if it returns nothing, read-after-write the
existing row and return it. No dedup table needed for the pure-DB case.

---

## Edge Cases

- **Two duplicate requests arrive concurrently (same key, both in flight)** → the UNIQUE constraint lets exactly one claim; the loser sees `pending` and retries, never a second effect.
- **The effect succeeds but the result-write crashes before `completed`** → the key stays `pending`;
  on replay, reconcile with the provider using the same forwarded key (its idempotency makes the
  retry a no-op) rather than blindly re-charging. Record the policy.
- **Client sends the same key with a different body** → fingerprint mismatch → 409 Conflict; do not serve the stale result and do not overwrite — the client has a bug.
- **The key's TTL expired and the client retries** → treated as a new request; acceptable because the retry window closed. Document the window so the boundary is a decision, not a surprise.

## References

- `references/when-and-fingerprint.md` — which operations must be idempotent, the Idempotency-Key
  envelope, canonical-body fingerprinting with Web Crypto, the Zod parse, and why a mismatch is a 409.
- `references/dedup-store.md` — the `request_idempotency` Drizzle table (scoped unique key, status,
  response jsonb, `expires_at`), the atomic `onConflictDoNothing` claim + branch, the per-table variant, the TTL sweep.
- `references/safe-retry.md` — the claim → effect → persist → replay lifecycle, forwarding the key to
  the provider, the in-transaction upsert for pure DB writes, and webhook event-id dedupe.

## Scripts

`scripts/` is reserved. A signal that would justify one: a static check flagging an effectful
mutation (an external provider call, or an `insert` of a money/state row) in a `protectedProcedure`
that never touches the dedup store or a `*_idempotency` unique key. Until reliably greppable, no script.
