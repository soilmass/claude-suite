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

If the create also writes related rows or fires an effect, do the upsert and those writes in
one `db.transaction(async (tx) => …)` so a duplicate retry commits nothing twice.

## Webhook event-id dedupe

A webhook provider redelivers on any non-2xx (and sometimes even on a 2xx that it didn't record
in time). After `webhook-handler` has verified the signature and parsed the event, dedupe on
the provider's stable event id — that *is* the idempotency key, so the client doesn't supply one.

Because the effect is your own DB write, claim and process in *one* transaction: insert the dedup
row with `onConflictDoNothing` inside the tx, and if it conflicts the event was already handled.
On a `processEvent` throw the whole tx — claim included — rolls back, so a redelivery cleanly
reprocesses instead of getting stuck on a committed `pending` row.

```ts
// after webhook-handler verifies + parses `event` (Stripe Event, evt_…)
const fp = await fingerprint(event);
await db.transaction(async (tx) => {
  const claimed = await tx
    .insert(requestIdempotency)
    .values({
      scopeId: "webhook:stripe",
      idempotencyKey: event.id,
      fingerprint: fp,
      status: "completed", // commits atomically with the effect, so it never lingers as pending
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })
    .onConflictDoNothing({ target: [requestIdempotency.scopeId, requestIdempotency.idempotencyKey] })
    .returning({ key: requestIdempotency.idempotencyKey });
  if (claimed.length === 0) return; // already processed by a prior delivery — skip the effect
  await processEvent(tx, event); // the side effect, exactly once; rolls back with the claim on throw
});
return new Response("ok", { status: 200 }); // ack either way so the provider stops redelivering
```

Key points:
- **Always ack 200 on a duplicate** — a non-2xx makes the provider redeliver forever.
- **Claim + process share one transaction** here because the effect is your own DB write. For an
  *external* effect (a charge inside a webhook) fall back to the claim → effect → persist order
  above, since a DB transaction can't roll back the charge.
- **The event id is the natural key** — never generate a fresh key per delivery, that defeats it.
