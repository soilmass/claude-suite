Purpose: the Stripe webhook route end to end on the edge — raw body, async SubtleCrypto verification, Zod-parse the verified event, and idempotent processing keyed on the Stripe event id (Rules 8, 2).

# Stripe webhook: verify(async) → Zod-parse → idempotent process

The order is non-negotiable, and mirrors the Svix pipeline in `clerk-auth-flows`: **verify the
signature, then Zod-parse the verified-but-`unknown` event, then process it idempotently.** Two
things make Stripe-on-edge different from the Clerk/Svix instance: the verifier must be the
**async** one (Web Crypto, not Node `crypto`), and idempotency is keyed on the **Stripe event
id** in a dedicated ledger table.

## The route

```ts
// src/app/api/webhooks/stripe/route.ts
import Stripe from "stripe";                       // for the SubtleCrypto provider + Event type
import { eq } from "drizzle-orm";
import { stripe } from "~/server/stripe";
import { env } from "~/env";
import { db } from "~/server/db";
import { processedStripeEvents } from "~/server/db/schema/billing";
import { stripeEvent } from "./schema";          // the Zod discriminated union (below)
import { handleStripeEvent } from "./handlers";   // the lifecycle mapping (subscription-and-money.md)

export const runtime = "edge";

export async function POST(req: Request) {
  // 1. RAW body + signature header. Must be the exact bytes — never req.json() first.
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("missing stripe-signature", { status: 400 });

  // 2. Verify with the ASYNC verifier + a SubtleCrypto provider (edge has no Node crypto).
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      sig,
      env.STRIPE_WEBHOOK_SECRET,
      undefined,
      Stripe.createSubtleCryptoProvider(), // Web Crypto — the load-bearing edge detail
    );
  } catch {
    return new Response("invalid signature", { status: 400 }); // never 2xx an unverified call
  }

  // 3. Zod-parse the verified-but-unknown event (Rule 8). The union only lists events we act
  //    on, so a parse miss is an event we don't model — acknowledge it (200) so Stripe stops
  //    retrying. Only a bad SIGNATURE is a 4xx; an unmodeled event is not an error.
  const parsed = stripeEvent.safeParse(event);
  if (!parsed.success) {
    return new Response(null, { status: 200 }); // unmodeled/ignored event — ack, do nothing
  }

  // 4. Idempotency gate (only for events we process): record the event id; if it already
  //    existed, this is a retry — no-op.
  const inserted = await db
    .insert(processedStripeEvents)
    .values({ id: event.id, type: event.type })
    .onConflictDoNothing({ target: processedStripeEvents.id })
    .returning({ id: processedStripeEvents.id });
  if (inserted.length === 0) {
    return new Response(null, { status: 200 }); // already processed — acknowledge, do nothing
  }

  // 5. Process the typed event. Errors → 5xx so Stripe retries; roll the ledger row back first
  //    so the retry is allowed to re-run (the handler writes are themselves upserts).
  try {
    await handleStripeEvent(parsed.data);
  } catch {
    await db.delete(processedStripeEvents).where(eq(processedStripeEvents.id, event.id));
    return new Response("handler failed", { status: 500 });
  }

  return new Response(null, { status: 200 }); // 2xx ONLY after a successful process
}
```

## The Zod event schema (Rule 8 — verified ≠ trusted)

A Stripe-verified event is still `unknown` as far as *your* invariants go: the SDK types
describe Stripe's API surface, not the narrow subset you persist. Parse the events you handle
into a discriminated union, narrowing each to exactly the fields you write. This is the step
the baseline run skipped (it cast `sub.status as SubStatus` straight into Drizzle).

```ts
// src/app/api/webhooks/stripe/schema.ts
import { z } from "zod";

const subscriptionObject = z.object({
  id: z.string(),
  customer: z.string(),
  status: z.enum([
    "active", "trialing", "past_due", "canceled",
    "incomplete", "incomplete_expired", "unpaid", "paused",
  ]),
  cancel_at_period_end: z.boolean(),
  current_period_end: z.number().int(), // unix seconds → convert to timestamptz at write
  items: z.object({ data: z.array(z.object({ price: z.object({ id: z.string() }) })).min(1) }),
  metadata: z.object({ userId: z.string() }),
});

export const stripeEvent = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("checkout.session.completed"),
    data: z.object({ object: z.object({
      id: z.string(),
      mode: z.enum(["payment", "subscription", "setup"]),
      customer: z.string().nullable(),
      subscription: z.string().nullable(),
      payment_intent: z.string().nullable(),
      amount_total: z.number().int().nullable(), // already minor units
      currency: z.string().nullable(),
      metadata: z.object({ userId: z.string() }),
    }) }),
  }),
  z.object({
    type: z.literal("customer.subscription.created"),
    created: z.number().int(),
    data: z.object({ object: subscriptionObject }),
  }),
  z.object({
    type: z.literal("customer.subscription.updated"),
    created: z.number().int(),
    data: z.object({ object: subscriptionObject }),
  }),
  z.object({
    type: z.literal("customer.subscription.deleted"),
    data: z.object({ object: z.object({ id: z.string() }) }),
  }),
  // invoice.paid / invoice.payment_failed — add as you handle them
]);

export type StripeEvent = z.infer<typeof stripeEvent>;
```

## The idempotency ledger

```ts
// part of src/server/db/schema/billing.ts (full schema in subscription-and-money.md)
export const processedStripeEvents = pgTable("processed_stripe_events", {
  id: text("id").primaryKey(),                 // the Stripe event id (evt_...)
  type: text("type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});
```

Keying on `event.id` is stronger than per-handler natural-key dedup: it covers **every** event
type uniformly, including ones whose effect has no convenient unique column, and it makes the
"did we already see this?" check one cheap insert.

## Why each step

- **`req.text()`, not `req.json()`** — the signature is an HMAC over the exact bytes;
  re-serializing changes whitespace and breaks verification.
- **`constructEventAsync` + `createSubtleCryptoProvider()`** — the synchronous `constructEvent`
  uses Node `crypto`, absent on the edge; the async path uses Web Crypto `subtle`. Using the
  sync verifier is the most common edge-Stripe failure.
- **Parse before the ledger; ledger before processing** — parse first so an unmodeled event
  never pollutes the ledger; then the `onConflictDoNothing` ledger insert returns empty on a
  replay so you no-op. On handler failure, delete the ledger row so the retry can re-run.
- **`safeParse` → 200 for unmodeled events** — the union lists only events you act on, so a
  parse miss means "don't handle this"; acknowledge it (200) rather than 4xx, or Stripe retries
  a perfectly valid event for days. The 4xx case is a bad **signature**, not an unknown type.
- **Public to the auth matcher, authenticated by signature** — this route is in
  `clerkMiddleware`'s public list; its auth is the Stripe signature, not a Clerk session.

## Replay-vs-ordering note

The event-id ledger blocks *duplicate* delivery. It does **not** order events: Stripe may
deliver a `customer.subscription.updated` out of sequence. Handle ordering in the lifecycle
mapping (compare `event.created` / `current_period_end` before overwriting) — see
`subscription-and-money.md`.
