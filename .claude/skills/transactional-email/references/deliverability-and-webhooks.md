Purpose: deliverability basics (SPF/DKIM/DMARC as infra vs. code), signed bounce/complaint webhook verification, the Zod-parsed event body, the suppression table and pre-send check, and the no-PII log fields for delivery events.

# Deliverability, bounce/complaint webhooks, and suppression

Sending the email is the easy half. Staying *out of the spam folder and off blocklists* is the
half the naive build skips — it has no feedback loop, so it keeps mailing addresses that bounce
and complain until a provider throttles or a blocklist lists the domain. This reference is that
feedback loop.

## 1. SPF / DKIM / DMARC are infrastructure, not code

These authenticate your domain so receivers trust your mail. They are **DNS records**, set once
per sending subdomain — they do not belong in the application:

- **SPF** — a TXT record listing who may send for the domain (include the provider).
- **DKIM** — the provider gives you CNAME/TXT records; receivers verify a signature.
- **DMARC** — a policy record (`p=quarantine`/`p=reject`) tying SPF+DKIM together and giving you
  aggregate reports.

In *code*, the only deliverability levers are: send `from` a **verified subdomain**
(`mail.acme.com`, not the apex), set a real `reply_to`, and never send to a suppressed address.
Record the DNS setup in the deployment runbook; do not try to manage it from the app.

## 2. Verify the webhook signature BEFORE trusting the body (Rule 8)

Providers POST delivery events (sent, delivered, bounced, complained) to a route you expose.
The body is attacker-reachable, so verify the signature first, then Zod-parse. Most
Resend-class providers sign with Svix.

```ts
// src/app/api/webhooks/resend/route.ts
import { Webhook } from "svix";
import { z } from "zod";
import { serverEnv } from "~/env";
import { suppress } from "~/lib/email/suppression";
import { log } from "~/lib/log";

export const runtime = "edge";

const event = z.object({
  type: z.enum([
    "email.sent",
    "email.delivered",
    "email.bounced",
    "email.complained",
  ]),
  data: z.object({
    email_id: z.string(),                 // provider message id — safe to log
    to: z.array(z.string().email()).min(1), // PII — used, never logged
    bounce_type: z.enum(["hard", "soft"]).optional(),
  }),
});

export async function POST(req: Request) {
  const payload = await req.text();
  const headers = {
    "svix-id": req.headers.get("svix-id") ?? "",
    "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
    "svix-signature": req.headers.get("svix-signature") ?? "",
  };

  let verified: unknown;
  try {
    verified = new Webhook(serverEnv.EMAIL_WEBHOOK_SECRET).verify(payload, headers);
  } catch {
    return new Response("invalid signature", { status: 401 });
  }

  const parsed = event.safeParse(verified);
  if (!parsed.success) return new Response("ignored", { status: 200 }); // ack unknown events

  const { type, data } = parsed.data;

  // Idempotent on the provider message id: a redelivery must not double-process.
  if (type === "email.bounced" && data.bounce_type === "hard") {
    await suppress(data.to, "hard_bounce", data.email_id);
  } else if (type === "email.complained") {
    await suppress(data.to, "complaint", data.email_id);
  }

  // No address, no body — only the opaque message id and the event type.
  log.info(type, { messageId: data.email_id });
  return new Response("ok", { status: 200 });
}
```

Two things the naive build gets wrong here: it never verifies the signature (forgery), and it
logs `data.to` "to see who bounced" — that is PII in the drain. Log the `email_id` only.

## 3. The suppression table and the pre-send check

A hard bounce or a spam complaint means **stop sending to that address.** Persist it and check
it before every send — the send client already calls `isSuppressed()` first (see
`email-client.md` §5).

```ts
// drizzle: suppressed_emails  (add to a live schema via migration-author)
//   id uuidv7 pk
//   email_hash text not null unique   -- store a hash, not the raw address (Rule 9)
//   reason text not null              -- 'hard_bounce' | 'complaint' | 'manual'
//   provider_message_id text          -- the event that caused it (idempotency)
//   created_at timestamptz not null default now()   -- Rule 6, UTC
```

```ts
// src/lib/email/suppression.ts
import { eq } from "drizzle-orm";
import { db } from "~/db";
import { suppressedEmails } from "~/db/schema/email";
import { hashEmail } from "./hash"; // Web Crypto SHA-256 — edge-safe, no node:crypto

export async function suppress(addresses: string[], reason: string, messageId: string) {
  // One insert per address; onConflictDoNothing makes redelivery idempotent.
  await db
    .insert(suppressedEmails)
    .values(
      await Promise.all(
        addresses.map(async (a) => ({
          emailHash: await hashEmail(a),
          reason,
          providerMessageId: messageId,
        })),
      ),
    )
    .onConflictDoNothing();
}

export async function isSuppressed(address: string): Promise<boolean> {
  const row = await db.query.suppressedEmails.findFirst({
    where: eq(suppressedEmails.emailHash, await hashEmail(address)),
  });
  return Boolean(row);
}
```

Storing the **hash** (not the raw address) means the suppression list itself is not a PII
honeypot. A soft bounce is transient — do not suppress on it; let the provider retry.

## 4. What a delivery-event log line may contain

| Field            | Logged? | Why                                              |
|------------------|---------|--------------------------------------------------|
| `event` / `type` | yes     | stable name, queryable                           |
| `messageId`      | yes     | opaque provider id, joins to the send            |
| hashed user id   | yes     | identifies the user without the address          |
| recipient address| **no**  | PII (Rule 9)                                      |
| subject / html   | **no**  | unbounded, often carries a token (Rule 9)        |
| `bounce_type`    | yes     | scalar, no PII                                    |

This is the same allowlist discipline `log-discipline` applies generally; here it is the hard
line for the email channel specifically.
