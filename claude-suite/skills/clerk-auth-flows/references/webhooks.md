Purpose: the Clerk webhook pipeline — Svix-verify, Zod-parse, then idempotent Drizzle upsert (Rules 8/2/9), with edge-runtime caveats.

# Clerk webhooks: verify → parse → sync

Clerk delivers webhooks signed via Svix. The order is non-negotiable: **verify the signature,
then Zod-parse the verified-but-`unknown` body, then write.** Skipping either step is the
baseline defect this skill exists to prevent.

## The route

```ts
// src/app/api/webhooks/clerk/route.ts
import { Webhook } from "svix";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "~/env";
import { db } from "~/server/db";
import { users } from "~/server/db/schema";

// Clerk's outbound webhook payloads we handle, narrowed to what we persist.
const clerkEvent = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("user.created"),
    data: z.object({
      id: z.string(),
      email_addresses: z
        .array(z.object({ id: z.string(), email_address: z.string().email() }))
        .min(1),
      primary_email_address_id: z.string().nullable(),
    }),
  }),
  z.object({
    type: z.literal("user.deleted"),
    data: z.object({ id: z.string(), deleted: z.boolean().optional() }),
  }),
  // organization.created / organizationMembership.created when org-scoped (see middleware-and-auth.md)
]);

export async function POST(req: Request) {
  // 1. Pull Svix headers + RAW body (must be the unparsed text).
  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("missing svix headers", { status: 400 });
  }
  const body = await req.text(); // text, NOT req.json() — verify needs the exact bytes

  // 2. Verify the signature (Rule 8 boundary, and the auth for this endpoint).
  let evt: unknown;
  try {
    evt = new Webhook(env.CLERK_WEBHOOK_SIGNING_SECRET).verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });
  } catch {
    return new Response("invalid signature", { status: 400 }); // never 2xx an unverified call
  }

  // 3. Zod-parse the verified-but-unknown payload (Rule 8). safeParse → 4xx, not a throw.
  const parsed = clerkEvent.safeParse(evt);
  if (!parsed.success) {
    return new Response("unhandled or malformed event", { status: 400 });
  }
  const event = parsed.data;

  // 4. Branch + idempotent write (Rule 7: no per-row loop; Rule 6: timestamptz handled by schema).
  switch (event.type) {
    case "user.created": {
      const primary =
        event.data.email_addresses.find(
          (e) => e.id === event.data.primary_email_address_id,
        ) ?? event.data.email_addresses[0];
      await db
        .insert(users)
        .values({ clerkId: event.data.id, email: primary.email_address })
        .onConflictDoNothing({ target: users.clerkId }); // idempotent: retries are safe
      break;
    }
    case "user.deleted": {
      // Soft vs hard delete is a schema-time call — see CLAUDE.md. Soft shown here.
      await db
        .update(users)
        .set({ deletedAt: new Date() })
        .where(eq(users.clerkId, event.data.id));
      break;
    }
  }

  return new Response(null, { status: 200 }); // 2xx ONLY after a successful write
}
```

## Why each step

- **`req.text()`, not `req.json()`** — Svix verifies the exact byte sequence; re-serializing a
  parsed object changes whitespace and breaks the HMAC.
- **`onConflictDoNothing` / upsert** — Svix retries on any non-2xx and may deliver duplicates.
  Handlers must be idempotent or you get duplicate rows / double-applied effects.
- **`safeParse` over `parse`** — an unhandled event type should return a clean 4xx, not a 500
  that makes Svix retry forever.
- **Public to the session matcher, authenticated by signature** — this endpoint is in the
  middleware's public list (see `middleware-and-auth.md`); its auth is the Svix signature, not
  a Clerk session.

## Edge-runtime caveat

`svix`'s `verify` is synchronous and HMAC-based and runs on the edge in current versions. If a
runtime polyfill gap surfaces (rare), reimplement verification with Web Crypto
`crypto.subtle` HMAC-SHA256 over `${svixId}.${svixTimestamp}.${body}`, base64-compare against
the `v1,` portion of `svix-signature`, and reject stale timestamps (>5 min) to block replay.
Record any such deviation in `DECISIONS.md`.

## Configuring it

1. Create the endpoint in the Clerk Dashboard → Webhooks, pointed at
   `https://<host>/api/webhooks/clerk`, subscribed to the events you handle.
2. Copy the signing secret (`whsec_...`) into `CLERK_WEBHOOK_SIGNING_SECRET` — server-only env,
   never `NEXT_PUBLIC_*` (Rule 9).
3. Keep the schema the webhook writes to (`users`, `organizations`) owned by `schema-design`;
   this route only syncs into it.
