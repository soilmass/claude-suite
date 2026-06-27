Purpose: the edge-safe HTTP send client — why not nodemailer/SMTP, the server-only key from validated env, from/reply-to, React Email server rendering, the shared Zod send payload, the idempotency-key pattern, and the send-after-commit rule.

# The edge-safe email send client

The whole job: read a server-only key, build a typed request, `fetch` the provider's REST
endpoint, parse a typed response, and never leak the recipient or body into a log. Everything
that makes email hard on the edge follows from one constraint — **there is no SMTP at the edge.**

## 1. Why not `nodemailer` / SMTP

`nodemailer` (and any SMTP client) opens a TCP/TLS socket via Node's `net`/`tls`. The edge
runtime (Vercel Edge / Cloudflare Workers class) has neither — the import resolves but the
send throws at runtime, *in production only*, because dev often runs Node. The only portable
transport at the edge is HTTPS, which is exactly what a Resend-class REST API speaks. So the
client is a `fetch`, not a transport. Do not reach for an SDK that bundles a Node http agent;
prefer the provider's `fetch`-based SDK or call the REST endpoint directly.

## 2. The key comes from validated server env only (Rule 9)

```ts
// src/env.ts — see env-validation; the secret never gets a NEXT_PUBLIC_ prefix
import { z } from "zod";

export const serverEnv = z
  .object({
    EMAIL_API_KEY: z.string().min(1),       // server-only secret
    EMAIL_FROM: z.string().email(),         // e.g. "Acme <no-reply@mail.acme.com>" verified subdomain
    EMAIL_REPLY_TO: z.string().email(),
    EMAIL_WEBHOOK_SECRET: z.string().min(1), // Svix-class signing secret
  })
  .parse(process.env);
```

`EMAIL_API_KEY` is read only in server modules. It must never be imported into a Client
Component, never inlined into a `NEXT_PUBLIC_*` var, never returned from a tRPC procedure.

## 3. The shared Zod send payload (Rule 8)

One schema validates the recipient and the template variables, and it is the *same* object the
tRPC input parses and the send helper re-parses. Reuse the project email validator from
`zod-schema-library` rather than re-declaring `z.string().email()` everywhere.

```ts
// src/lib/email/schema.ts
import { z } from "zod";

export const sendInput = z.object({
  to: z.string().email(),                 // validated even when sourced from ctx.auth
  template: z.enum(["verify-email", "receipt", "export-ready"]),
  // vars is template-specific; validate per template, never `z.any()` (Rule 1)
  vars: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  idempotencyKey: z.string().min(1),      // derived from the triggering event
});
export type SendInput = z.infer<typeof sendInput>;
```

## 4. Typed React Email template, rendered on the server (Rule 1)

Template props are a TypeScript type, so a missing variable is a compile error, not a blank in
an inbox. Render to HTML on the server with `@react-email/render`; keep full rows and secrets
out of the props.

```ts
// src/emails/receipt.tsx
import { Html, Text, Section } from "@react-email/components";

export interface ReceiptProps {
  orderRef: string;
  lines: { label: string; amount: string }[]; // amount pre-formatted from minor units (Rule 5)
  total: string;                               // formatted at this edge, never a float
}

export function Receipt({ orderRef, lines, total }: ReceiptProps) {
  return (
    <Html>
      <Section>
        <Text>Receipt for {orderRef}</Text>
        {lines.map((l) => (
          <Text key={l.label}>{l.label}: {l.amount}</Text>
        ))}
        <Text>Total: {total}</Text>
      </Section>
    </Html>
  );
}
```

## 5. The send client — typed `fetch`, idempotent, suppression-aware

```ts
// src/lib/email/client.ts
import { z } from "zod";
import { render } from "@react-email/render";
import { serverEnv } from "~/env";
import { sendInput, type SendInput } from "./schema";
import { renderTemplate, subjectFor } from "./templates"; // map template id -> typed component + subject
import { isSuppressed } from "./suppression";    // SELECT from suppressed_emails (see webhooks ref)
import { log } from "~/lib/log";                 // log-discipline logger
import { hashUserId } from "~/lib/log/redact";   // async — Web Crypto crypto.subtle (see log-discipline)

const sendResult = z.object({ id: z.string() }); // parse the response — no untyped JSON (Rule 1)

export async function sendEmail(raw: SendInput, userId: string): Promise<{ id: string } | null> {
  const input = sendInput.parse(raw);            // Rule 8 — re-parse at the boundary

  // Suppression list: never send to a known-bad address (deliverability).
  if (await isSuppressed(input.to)) {
    log.info("email.suppressed", { template: input.template, userId: await hashUserId(userId) });
    return null;
  }

  const html = await render(renderTemplate(input.template, input.vars)); // @react-email/render is async

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${serverEnv.EMAIL_API_KEY}`,   // server-only (Rule 9)
      "content-type": "application/json",
      "idempotency-key": input.idempotencyKey,               // retry-safe: exactly once
    },
    body: JSON.stringify({
      from: serverEnv.EMAIL_FROM,
      reply_to: serverEnv.EMAIL_REPLY_TO,
      to: input.to,
      subject: subjectFor(input.template, input.vars),
      html,
    }),
  });

  if (!res.ok) {
    // Provider failure is logged + retried, never thrown at the user. No address, no body.
    log.error("email.failed", { template: input.template, status: res.status, userId: await hashUserId(userId) });
    return null; // caller decides to enqueue a retry with the SAME idempotencyKey
  }

  const { id } = sendResult.parse(await res.json());
  log.info("email.sent", { template: input.template, messageId: id, userId: await hashUserId(userId) });
  return { id };
}
```

Note what is *not* logged: `input.to`, `html`, and `input.vars` never appear in a log field
(Rule 9 + `log-discipline`). The only identifiers are the opaque provider `messageId` and the
hashed user id.

## 6. The idempotency key ties the send to its trigger

Derive the key from the event that caused the email, not from the send call:

- **Receipt:** `idempotencyKey: order.id` — a tRPC retry of `checkout` re-enters the send, but
  the provider treats the second request as the first and does not re-deliver.
- **Verification:** `idempotencyKey: token.id` — one token, one email; reissuing a token is a
  new key.

Persist the outcome against the key so you can answer "did we email this?" without re-sending:

```ts
// minimal sent-email ledger (see migration-author to add it to a live schema)
// id uuidv7 pk, idempotency_key text unique, provider_message_id text,
// template text, sent_at timestamptz default now()   -- Rule 6, UTC
```

Record the keying choice (per-event vs per-attempt) in `DECISIONS.md`.

## 7. Send AFTER the critical commit

```ts
// checkout mutation — protectedProcedure with the ownership check (Rule 2)
// NB: interactive `db.transaction` does not run over the edge HTTP driver — use a CTE / `db.batch`
// / idempotent saga for the order write (see `edge-transactions`). Shown here only to mark the
// commit boundary; the load-bearing point is that the email is sent AFTER that boundary.
const order = await ctx.db.transaction(async (tx) => {
  /* write order + lines, ownership-scoped to ctx.auth.userId */
  return created;
});

// Email is OUTSIDE the transaction: a provider outage must not roll back a paid order.
await sendEmail(
  { to: order.email, template: "receipt", vars: receiptVars(order), idempotencyKey: order.id },
  ctx.auth.userId,
);
```

A `TRPCError` is appropriate only for a *caller* error (the recipient failed `sendInput.parse`).
A provider 5xx is logged and retried, not surfaced as a failed checkout.
