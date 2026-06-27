Purpose: the edge-safe Stripe client (Fetch HTTP client, pinned apiVersion), the Zod env boundary for the STRIPE_* secrets, and creating Checkout Sessions / PaymentIntents server-side with a server-derived amount (Rules 9, 8, 2).

# Edge Stripe client + server-side checkout

## 1. The env boundary (Rule 9/8)

The Stripe secret and webhook signing secret are server-only; only the publishable key is
public. Validate them in the one Zod env schema (`env-validation` owns this) — never reach for
`process.env.STRIPE_SECRET_KEY!` inline, which is both an unvalidated boundary (Rule 8) and a
non-null assertion that breaks the type chain (Rule 1).

```ts
// src/env.ts — see env-validation for the full t3-env wiring
export const env = createEnv({
  server: {
    STRIPE_SECRET_KEY: z.string().startsWith("sk_"),
    STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
    STRIPE_PRICE_PRO_MONTHLY: z.string().startsWith("price_"),
    STRIPE_PRICE_CREDIT_PACK: z.string().startsWith("price_"),
  },
  client: {
    // the ONLY Stripe value allowed under NEXT_PUBLIC_ (Rule 9)
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().startsWith("pk_"),
  },
  // ...runtimeEnv
});
```

## 2. The edge-safe client (Rule: edge runtime)

The Stripe SDK's default client uses Node's `http`/`https`, which do not exist in the Workers
edge runtime. Construct it with the **Fetch HTTP client** and an explicitly **pinned**
`apiVersion` so payload shapes don't shift under you when Stripe upgrades your account default.

```ts
// src/server/stripe.ts  — server-only module, never imported by a Client Component
import Stripe from "stripe";
import { env } from "~/env";

export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  // Pin it. The exact value is perishable — perishable-refresh tracks the current API version.
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(), // edge: fetch, not Node http
  typescript: true,
});
```

> The pinned `apiVersion` string is a dated specific — it perishes. Bump it deliberately after
> testing the new payload shapes; record the bump in `DECISIONS.md`.

## 3. The Stripe customer is found-or-created and tied to `ctx.auth.userId`

One Stripe customer per user, persisted locally so the webhook can map an event back to your
user and so you never create duplicate customers. The lookup is by `ctx.auth.userId` (Rule 2).

```ts
async function getOrCreateCustomer(ctx: Context): Promise<string> {
  const existing = await ctx.db.query.customers.findFirst({
    where: eq(customers.userId, ctx.auth.userId),
  });
  if (existing) return existing.stripeCustomerId;

  const customer = await stripe.customers.create({
    metadata: { userId: ctx.auth.userId }, // round-trips back on every event
  });
  await ctx.db
    .insert(customers)
    .values({ userId: ctx.auth.userId, stripeCustomerId: customer.id })
    .onConflictDoNothing({ target: customers.userId }); // idempotent under a race
  return customer.id;
}
```

## 4. Checkout: the client names a product, never sends an amount (Rule 2/8)

This is the line that prevents the open-cash-register defect. The input is a Zod enum of the
products you sell; the price id is resolved **server-side** from your env/DB. Nothing about the
amount comes from the browser.

```ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";

export const billingRouter = createTRPCRouter({
  createCheckout: protectedProcedure
    .input(z.object({ product: z.enum(["pro_monthly", "credit_pack"]) })) // Rule 8
    .mutation(async ({ ctx, input }) => {
      const customer = await getOrCreateCustomer(ctx);
      const isSub = input.product === "pro_monthly";

      // server-side price resolution — the client never sends a number
      const price = isSub ? env.STRIPE_PRICE_PRO_MONTHLY : env.STRIPE_PRICE_CREDIT_PACK;

      const session = await stripe.checkout.sessions.create({
        customer,
        mode: isSub ? "subscription" : "payment",
        line_items: [{ price, quantity: 1 }],
        success_url: `${env.APP_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${env.APP_URL}/billing/cancel`,
        // userId travels to the webhook on BOTH the session and the subscription object
        metadata: { userId: ctx.auth.userId, product: input.product },
        ...(isSub ? { subscription_data: { metadata: { userId: ctx.auth.userId } } } : {}),
      });

      if (!session.url) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "no checkout url" });
      }
      return { url: session.url };
    }),
});
```

## 5. PaymentIntent variant (custom UI instead of hosted Checkout)

When you render the Payment Element yourself, create the PaymentIntent server-side with the
**server-resolved** amount (looked up from your DB by the named SKU), and return only the
`client_secret`. The amount still never originates on the client.

```ts
const sku = await ctx.db.query.skus.findFirst({ where: eq(skus.id, input.skuId) });
if (!sku) throw new TRPCError({ code: "NOT_FOUND" });
const intent = await stripe.paymentIntents.create({
  customer,
  amount: sku.priceMinor,   // integer minor units from YOUR db (money-modeling), not the client
  currency: sku.currency,
  metadata: { userId: ctx.auth.userId, skuId: sku.id },
});
return { clientSecret: intent.client_secret };
```

## 6. Why each choice

- **Fetch HTTP client** — the only client that runs under the edge runtime; the default Node
  client throws at runtime (`edge-runtime-constraints` covers the general class).
- **Pinned `apiVersion`** — Stripe rolls account defaults forward; pinning keeps the webhook's
  payload shapes (and your Zod schemas) stable until you choose to upgrade.
- **Product enum, server-resolved price** — the charge is authorized by your server, not the
  browser; this is Rule 2 at the payment boundary.
- **`metadata.userId` on session AND subscription** — the webhook can always recover the owner
  even if the local customer-map row is missing.
