Purpose: the shared Zod event taxonomy that is the type root for all capture — naming, the
typed `capture()`, identify-by-`userId`-without-PII, and the anonymous→user alias.

# Why a taxonomy, not string literals

`posthog.capture("user signed up")` at one call site and `capture("Signup")` at another are two
different events to the warehouse. The funnel silently breaks, props are unvalidated, and a
rename is a find-and-replace across the codebase instead of a compile error. A typed registry
makes the event name and its props part of the type chain (Rule 1) and gives a single place to
Zod-parse the payload before it leaves the process (Rule 8).

A note on "typed but not validated": a TypeScript `interface EventPropertyMap` is compile-time
only — it does **not** stop a wrong shape at runtime, and an event assembled from `any`/`unknown`
data (a webhook field, a DB row cast loosely) sails through. The taxonomy below is a Zod schema
so the same definition gives you the static type *and* the runtime parse.

# The registry (one schema per event, one discriminated union)

```ts
// src/lib/analytics/events.ts
import { z } from "zod";

// object.verb_past — stable, lowercase, dotted. Not a sentence, not Title Case.
export const analyticsEvent = z.discriminatedUnion("name", [
  z.object({
    name: z.literal("user.signed_up"),
    props: z.object({
      plan: z.enum(["free", "pro", "team"]),
      source: z.string().max(64),           // "google" | "email" | "invite" — never the email
    }),
  }),
  z.object({
    name: z.literal("checkout.started"),
    props: z.object({
      itemCount: z.number().int().positive(),
    }),
  }),
  z.object({
    name: z.literal("order.completed"),
    props: z.object({
      orderId: z.string().uuid(),
      totalCents: z.number().int().nonnegative(), // integer minor units, Rule 5 — never a float
      currency: z.string().length(3),
      itemCount: z.number().int().positive(),
    }),
  }),
]);

export type AnalyticsEvent = z.infer<typeof analyticsEvent>;
export type EventName = AnalyticsEvent["name"];
```

Adding an event is adding a member to the union; a typo in a `name` at a call site, or a missing
prop, is now a type error. The `props` are deliberately scalar and PII-free (see below).

# The typed capture seam

Every call site goes through one function that parses against the taxonomy. This is the single
boundary where an event is validated (Rule 8) and where consent/sampling is applied
(`references/capture-and-consent.md`), so no call site can bypass either.

```ts
// src/lib/analytics/capture.ts
import { analyticsEvent, type AnalyticsEvent } from "./events";

// No cast: `parse` returns the validated union, so the type chain stays unbroken (Rule 1).
export function buildEvent(event: AnalyticsEvent): AnalyticsEvent {
  // Throws in dev / no-ops to a logged error in prod if a call site drifts.
  return analyticsEvent.parse(event);
}
```

A bare `posthog.capture("…")` anywhere outside this module is the drift this skill forbids — the
candidate `scripts/` check greps for exactly that.

# Identify by `userId`, carry no PII

The distinct id is the Clerk `ctx.auth.userId` — an opaque, stable id — on both client and server,
so an event captured in the browser and one captured in a webhook land on the same person.

```ts
// NO email, name, address, or phone as traits. Rule 9.
posthog.identify(userId);                 // client, on login
posthogServer.identify({ distinctId: userId }); // server, in the webhook
```

Email/name belong in Clerk and your own DB, not the analytics warehouse. If you genuinely need to
segment by a non-PII attribute (plan, signup cohort, country), set *that* as a person property —
never the raw contact fields. The allowlist discipline is identical to `log-discipline`'s: an
explicit set of scalar, non-identifying properties, everything else dropped.

# Alias the anonymous session on login

Before login the library has an anonymous distinct id; events captured then (`page.viewed`,
`checkout.started`) must stitch to the real user once they sign up, or the top of the funnel is
orphaned.

```ts
// client, the moment Clerk reports a freshly signed-in user
posthog.identify(userId);   // posthog-js aliases the prior anonymous id → userId
// on sign-out, so the next user on a shared device starts clean:
posthog.reset();
```

Never mint a per-event or per-request random id — that fragments one person into many and makes
the funnel meaningless. One stable id before login (the library's anonymous id), aliased to the
`userId` after.
