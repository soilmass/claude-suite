Purpose: the claim -> effect -> persist -> replay lifecycle, forwarding the key to the provider, the in-transaction upsert for pure DB writes, and webhook event-id dedupe.

# Safe-retry lifecycle

## The full lifecycle for an external effect (a charge)

The danger with an external effect is that you cannot roll it back with a DB transaction: once
Stripe has charged the card, a `db.transaction` abort does not un-charge it. So the order is:
**claim → effect (with the key forwarded) → persist result**, and the forwarded key is what
makes the window between "effect done" and "result stored" safe.

```ts
// src/server/api/routers/billing.ts
import { TRPCError } from "@trpc/server";
import { claimKey } from "~/server/idempotency/claim";
import { fingerprint } from "~/server/idempotency/fingerprint";
import { completeKey } from "~/server/idempotency/complete";
import { chargeSchema } from "~/server/api/schemas/charge"; // the shared Zod schema (Rule 8)
import { chargeCustomer } from "~/server/billing/charge"; // plain business fn the procedure calls

export const billingRouter = createTRPCRouter({
  charge: protectedProcedure
    .input(chargeSchema) // amountMinor: integer, currency, customerId — money is minor units (Rule 5)
    .mutation(async ({ ctx, input }) => {
      const scopeId = ctx.auth.userId; // scope the key per caller (Rule 2)
      const key = ctx.idempotencyKey; // pulled from the header by middleware (see trpc-middleware)
      const fp = await fingerprint(input);

      const claim = await claimKey(ctx.db, scopeId, key, fp);
      if (claim.outcome === "replay") return claim.response; // identical original result, no re-charge

      // We own the effect. Forward the SAME key to the provider so even a lost result is safe:
      // a retry that reaches Stripe with this key returns the original charge, not a new one.
      const charge = await chargeCustomer({
        amountMinor: input.amountMinor,
        currency: input.currency,
        customerId: input.customerId,
        idempotencyKey: key, // Stripe's Idempotency-Key header
      });

      await completeKey(ctx.db, scopeId, key, charge); // status -> completed, response = charge
      return charge;
    }),
});
```

Why forward the key to the provider too: the dedup store protects against re-entering *your*
code, but if your process crashes after the charge and before `completeKey`, the row is still
`pending`. The next retry re-enters the effect — and only the provider's own idempotency
(keyed on the same string) stops a second charge. Belt and suspenders: your store + the
provider's. Reconcile a stuck `pending` key against the provider rather than blindly retrying.

## Returning the stored result verbatim on replay

A `completed` key returns the *original* response, not a fresh computation. This matters: the
caller may have retried precisely because they never saw the first response, and they must
observe one consistent outcome. The stored `response` jsonb is that outcome; `responseStatus`
lets an HTTP edge replay the original status code too.

## The pure-DB-write variant (no separate store)

When the effect is a single insert, fold the dedup into the table's own unique key and do it in
one statement — no `request_idempotency` row needed. The read-after-write guard returns the
already-created row on a retry.

```ts
// orders carries idempotency_key with: uniqueIndex("orders_user_key_uq").on(t.userId, t.idempotencyKey)
const [created] = await ctx.db
  .insert(orders)
  .values({ ...input, userId: ctx.auth.userId, idempotencyKey: key })
  .onConflictDoNothing({ target: [orders.userId, orders.idempotencyKey] })
  .returning();

if (created) return created; // fresh insert
// Retry: the row already exists — read-after-write and return it (no duplicate order).
const existing = await ctx.db.query.orders.findFirst({
  where: and(eq(orders.userId, ctx.auth.userId), eq(orders.idempotencyKey, key)),
});
if (!existing) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Idempotency row vanished." });
return existing;
```

If the create also writes related rows or fires an effect, fold those writes into the *same*
guarded statement set — a CTE or `db.batch` — not an interactive `db.transaction`, which the
edge HTTP driver does not support (see `edge-transactions`).

## Webhook event-id dedupe

A webhook provider redelivers on any non-2xx (and sometimes even on a 2xx that it didn't record
in time). After `webhook-handler` has verified the signature and parsed the event, dedupe on
the provider's stable event id — that *is* the idempotency key, so the client doesn't supply one.

The instinct is to claim and process in *one* `db.transaction` so a `processEvent` throw rolls the
claim back too. **That interactive transaction does not run at the edge** — the neon-http HTTP
driver throws on it (CLAUDE.md: no interactive transactions over HTTP; see `edge-transactions`).
Use the same **saga** the sibling `stripe-integration` webhook path uses: claim atomically with a
unique-key insert, process, persist the result, and *release the claim on failure* so a redelivery
can re-run instead of getting stuck on a committed `pending` row.

```ts
// after webhook-handler verifies + parses `event` (Stripe Event, evt_…)
const key = event.id; // the provider's stable event id IS the idempotency key
const [claim] = await db
  .insert(requestIdempotency)
  .values({
    scopeId: "webhook:stripe",
    idempotencyKey: key,
    fingerprint: await fingerprint(event),
    status: "pending",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  })
  .onConflictDoNothing({ target: [requestIdempotency.scopeId, requestIdempotency.idempotencyKey] })
  .returning();

if (!claim) return storedResultFor("webhook:stripe", key); // already claimed/processed → stored result

try {
  const result = await processEvent(event); // the side effect, exactly once
  await db
    .update(requestIdempotency)
    .set({ status: "completed", response: result })
    .where(and(
      eq(requestIdempotency.scopeId, "webhook:stripe"),
      eq(requestIdempotency.idempotencyKey, key),
    ));
  return new Response("ok", { status: 200 });
} catch (e) {
  // release the claim so a retry can re-run (no interactive tx to roll back at the edge)
  await db
    .delete(requestIdempotency)
    .where(and(
      eq(requestIdempotency.scopeId, "webhook:stripe"),
      eq(requestIdempotency.idempotencyKey, key),
    ));
  throw e;
}
```

Key points:
- **Always ack 200 on a duplicate** — a non-2xx makes the provider redeliver forever.
- **No interactive transaction** — the edge HTTP driver can't span `claim` and `processEvent` in one
  `db.transaction`. The saga substitutes a delete-on-failure to release the claim (see `edge-transactions`).
- **The event id is the natural key** — never generate a fresh key per delivery, that defeats it.
