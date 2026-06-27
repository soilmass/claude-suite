Purpose: the webhook_events dedup table keyed on event id, idempotent upserts, tolerating unknown/added fields in Zod, safeParse status mapping, and the fast-ack + defer pattern (Rules 8/7).

# Parse, dedup, and fast-ack

Verification proves the body is authentic; it says nothing about whether you've *already seen*
this event. Providers retry on any non-2xx and re-deliver duplicates, so every webhook must be
idempotent, keyed on the provider's event id.

## Zod-parse, tolerating unknown fields

The verified body is still `unknown`. Parse it with `safeParse` against a discriminated union on
the event type, modelling only the fields you persist — and do **not** `.strict()`, so a provider
adding a new field never 500s your endpoint (Zod's default is to strip unknown keys; that is the
behaviour you want — tolerant, not rejecting):

```ts
import { z } from "zod";

const stripeEvent = z.discriminatedUnion("type", [
  z.object({
    id: z.string(),                       // the dedup key
    type: z.literal("checkout.session.completed"),
    data: z.object({
      object: z.object({ id: z.string(), amount_total: z.number().int() }), // minor units (Rule 5)
    }),
  }),
  // ...other handled types
]);

const parsed = stripeEvent.safeParse(JSON.parse(raw));
if (!parsed.success) return new Response("unhandled or malformed", { status: 400 });
const event = parsed.data; // fully typed (Rule 1), unknown extra fields tolerated
```

`safeParse` over `parse`: an unhandled type returns a clean 4xx, never an unhandled throw → 500.

## Dedup on the event id

Record every event id before acting; a duplicate delivery hits the conflict and short-circuits:

```ts
// src/db/schema/webhook-events.ts — own the table via schema-design
export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(),                 // provider event id
  provider: text("provider").notNull(),
  type: text("type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(), // Rule 6
});

const inserted = await db
  .insert(webhookEvents)
  .values({ id: event.id, provider: "stripe", type: event.type })
  .onConflictDoNothing({ target: webhookEvents.id })
  .returning({ id: webhookEvents.id });

if (inserted.length === 0) {
  return new Response(null, { status: 200 }); // already processed — idempotent no-op
}
```

The domain effect is also idempotent — an upsert keyed on a natural id, never a bare `insert` that
duplicates on retry:

```ts
const obj = event.data.object; // the checkout session, already Zod-narrowed above
await db
  .insert(orders)
  .values({ stripeSessionId: obj.id, amountMinor: obj.amount_total, status: "paid" })
  .onConflictDoUpdate({ target: orders.stripeSessionId, set: { status: "paid" } });
```

The dedup-table + idempotent-write mechanics are `idempotency-keys`' domain; this skill just wires
them at the webhook boundary.

## Fast-ack and defer

Providers enforce an ack timeout (Stripe's is seconds). Acknowledge as soon as the event is
durably recorded, and push expensive work off the request path so a slow job never causes a
spurious retry:

```ts
await recordEvent(event);                            // durable — the dedup row
await enqueue("fulfil-order", { sessionId: obj.id }); // AWAIT the enqueue: the runtime may freeze
return new Response(null, { status: 202 });          // after the response, so fire-and-forget can drop it
```

Await the **enqueue** (a fast, durable handoff) — not the job itself. A `void enqueue(...)` left
unawaited can be discarded when the serverless/edge runtime freezes the moment you return the
response. If the work is cheap and reliably within the window, doing it inline (still idempotently)
is fine — but the moment it could exceed the timeout, defer. Because both the dedup row and the effect are
keyed on the event id, a retry that races the deferred job is safe: it no-ops.

## Why each guarantee

- **Dedup on event id** — the provider *will* re-deliver; without it you double-charge / duplicate.
- **Idempotent upsert** — the second attempt converges to the same state instead of inserting again.
- **Fast-ack + defer** — keeps you inside the ack window so the provider doesn't retry a request
  that actually succeeded but ran long.
