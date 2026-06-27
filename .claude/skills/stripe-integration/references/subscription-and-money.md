Purpose: the Drizzle subscription/payment schema, the status pgEnum + lifecycle event mapping, and reconciling Stripe minor units into the money-modeling columns (Rules 5, 6, 2, 7).

# Subscription state + money reconciliation

## 1. The schema

Money columns are `money-modeling`'s call — `integer` minor units paired with a `currency`,
never a float (Rule 5). Time is `timestamptz`, UTC (Rule 6). The status is a `pgEnum` mirroring
Stripe's `subscription.status` so the mapping is 1:1.

```ts
// src/server/db/schema/billing.ts
import {
  pgTable, text, integer, timestamp, boolean, pgEnum, uuid, index, uniqueIndex,
} from "drizzle-orm/pg-core";

// one Stripe customer per app user (Clerk userId owns identity)
export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),       // UUIDv7 in practice — see uuidv7-ids
  userId: text("user_id").notNull(),                  // ctx.auth.userId (Clerk)
  stripeCustomerId: text("stripe_customer_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: uniqueIndex("customers_user_id_idx").on(t.userId),
  custIdx: uniqueIndex("customers_stripe_customer_id_idx").on(t.stripeCustomerId),
}));

export const subscriptionStatus = pgEnum("subscription_status", [
  "active", "trialing", "past_due", "canceled",
  "incomplete", "incomplete_expired", "unpaid", "paused",
]);

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  stripeCustomerId: text("stripe_customer_id").notNull(),
  stripeSubscriptionId: text("stripe_subscription_id").notNull(),
  stripePriceId: text("stripe_price_id").notNull(),
  status: subscriptionStatus("status").notNull(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index("subscriptions_user_id_idx").on(t.userId),
  subIdx: uniqueIndex("subscriptions_stripe_subscription_id_idx").on(t.stripeSubscriptionId),
}));

// append-only ledger of one-off payments
export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  stripeCheckoutSessionId: text("stripe_checkout_session_id").notNull(),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  amountMinor: integer("amount_minor").notNull(),     // integer minor units (money-modeling)
  currency: text("currency").notNull(),               // ISO 4217 — travels with the amount
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index("payments_user_id_idx").on(t.userId),
  sessIdx: uniqueIndex("payments_stripe_checkout_session_id_idx").on(t.stripeCheckoutSessionId),
}));
```

> Adding these to a live database is `migration-author`'s job (expand-contract, reversible
> `down`). The money column type and currency companion are decided by `money-modeling`; record
> the choice in `DECISIONS.md`.

## 2. Lifecycle mapping

`handleStripeEvent` receives the **Zod-parsed** event (see `webhooks-and-idempotency.md`) and
maps it onto the schema. Subscription writes are upserts keyed on `stripe_subscription_id`, so
they are safe to re-run; the payment write is keyed on the checkout session id.

```ts
// src/app/api/webhooks/stripe/handlers.ts
import type { StripeEvent } from "./schema";

export async function handleStripeEvent(event: StripeEvent): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object;
      if (s.mode === "payment" && s.amount_total !== null && s.currency) {
        // Stripe amount is ALREADY integer minor units — store as-is (Rule 5), no /100.
        await db.insert(payments).values({
          userId: s.metadata.userId,
          stripeCheckoutSessionId: s.id,
          stripePaymentIntentId: s.payment_intent,
          amountMinor: s.amount_total,
          currency: s.currency.toUpperCase(),
        }).onConflictDoNothing({ target: payments.stripeCheckoutSessionId });
      }
      // subscription mode: the customer.subscription.created event carries the full object;
      // no need to act here beyond recording the payment side.
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      await upsertSubscription(event.data.object, event.created);
      break;
    }

    case "customer.subscription.deleted": {
      await db.update(subscriptions)
        .set({ status: "canceled", updatedAt: new Date() })
        .where(eq(subscriptions.stripeSubscriptionId, event.data.object.id));
      break;
    }
  }
}
```

## 3. The upsert, with ordering protection

The out-of-order hazard: Stripe can deliver a stale `subscription.updated` after a newer one.
Guard by only applying an update whose period end is not older than what you have stored.

```ts
async function upsertSubscription(sub: SubObject, eventCreated: number): Promise<void> {
  const periodEnd = new Date(sub.current_period_end * 1000); // unix seconds → UTC timestamptz
  await db.insert(subscriptions).values({
    userId: sub.metadata.userId,
    stripeCustomerId: sub.customer,
    stripeSubscriptionId: sub.id,
    stripePriceId: sub.items.data[0].price.id,
    status: sub.status,                  // already narrowed by Zod to the pgEnum values
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  }).onConflictDoUpdate({
    target: subscriptions.stripeSubscriptionId,
    set: {
      status: sub.status,
      stripePriceId: sub.items.data[0].price.id,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      updatedAt: new Date(),
    },
    // skip the write if a newer period is already stored (drops stale out-of-order updates)
    setWhere: lte(subscriptions.currentPeriodEnd, periodEnd),
  });
}
```

## 4. Reconciling amounts (Rule 5)

- Stripe sends `amount`, `amount_total`, `amount_paid`, invoice line `amount` all as **integer
  minor units** in the smallest unit of the `currency`. Store them directly in `amount_minor`
  with the `currency` — there is no division on ingest.
- **Zero-decimal currencies** (JPY, KRW): `amount_total: 1200` means ¥1200, not ¥12.00. The
  per-currency exponent lives in `money-modeling` and is applied only at the display edge — your
  stored integer is already correct.
- Never `parseFloat` a Stripe amount or store it as dollars; that reintroduces the Rule 5 bug
  the integer column exists to prevent.

## 5. Reading subscription status (Rule 2)

"Is this user Pro right now?" is a `protectedProcedure` filtered by `ctx.auth.userId`, not a
trust of a cached client flag:

```ts
const sub = await ctx.db.query.subscriptions.findFirst({
  where: and(eq(subscriptions.userId, ctx.auth.userId),
             inArray(subscriptions.status, ["active", "trialing"])),
});
const isPro = !!sub && sub.currentPeriodEnd > new Date();
```

One query, no per-row loop (Rule 7); ownership-scoped (Rule 2); timestamp compared in UTC
(Rule 6). Pair the money-moving writes with an `audit-log-pattern` entry in the same
transaction when you need a durable financial trail.
