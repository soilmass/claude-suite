---
name: transactional-email
description: >
  Send transactional email from the edge stack through a Resend-class HTTP API: an edge-safe
  `fetch` client (no Node SMTP/transport), React Email templates, validation/notification/receipt
  flows, a shared Zod schema on the send payload, idempotency keys so a retried send fires once,
  and signed bounce/complaint webhooks that maintain a suppression list — all without ever
  logging an email address, body, or API key. Encodes Rule 9 (key server-only, no PII
  client-side), Rule 8 (the send payload and webhook body are Zod-parsed), and the
  no-PII-in-logs discipline end to end.
  Use when: "send a verification email", "transactional email", "receipt email", "email the
  user", "Resend integration", "handle email bounces".
  Do NOT use for: marketing/campaign/newsletter blasts and audience management (different
  consent + unsubscribe regime, not this skill); in-app notification UI/badges (build as a
  vertical-slice); operational stdout logging (use log-discipline).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the transactional-email failure class on the edge: a Node
    SMTP/`nodemailer` transport that cannot run at the edge, the API key read straight from
    `process.env` (or worse, exposed `NEXT_PUBLIC_*`, Rule 9), an unvalidated recipient/payload
    (Rule 8), no idempotency so a retry double-sends, fire-and-forget delivery with no
    bounce/complaint handling, and `console.log` of the full recipient address and rendered
    body. Baseline section is the encoded failure class; replace with an observed transcript.
---

# transactional-email

The build-loop skill for *one* email triggered by *one* action — verify-your-address, here is
your receipt, your export is ready. Given "email the user a receipt," it produces an edge-safe
HTTP send client, a typed React Email template, an idempotent send keyed to the triggering
event, and the signed bounce/complaint webhook that keeps you off blocklists — none of it
leaking the recipient or body into logs. It exists because the naive build reaches for a Node
SMTP transport that does not exist at the edge, sends fire-and-forget, and prints the address
to `console`.

The spine and nine inviolable rules live in `../../CLAUDE.md`; this skill is concrete about Rule
9 (key server-only, nothing email-derived client-side), Rule 8 (send payload, recipient, and
inbound webhook body all Zod-parsed), Rule 6 (UTC `timestamptz`), and the no-PII-in-logs
discipline (`log-discipline`). Marketing email — consent, audiences, unsubscribe — is out of scope.

---

## Non-Negotiable Rules

Email defects ship green: the happy-path send works in dev; the leak, the double receipt, or
the blocklisting only surface in production. Hard lines:

- **Never log an email address, subject, or rendered body.** Log a stable event (`email.sent`)
  with the provider message id and a hashed user id only — never the recipient, the HTML, or the
  template variables (Rule 9 + `log-discipline`). An address is PII; a body often carries a token.
- **Never put the provider API key where a client can reach it.** Server-only secret: read it
  from the Zod-validated server env, never `NEXT_PUBLIC_*`, never a Client Component (Rule 9).
- **Never send to an unvalidated recipient or payload.** Recipient, template variables, and the
  inbound webhook body are each Zod-parsed before use (Rule 8). An invalid address wastes
  reputation; an unverified webhook is a forgery vector.
- **Never send a state-changing email without an idempotency key.** Key the send to the
  triggering event id so a retried mutation or redelivered webhook is a no-op, not a second send.

Refuse these rationalizations: "just use nodemailer, it's standard" (no SMTP at the edge); "log
the recipient to debug delivery" (PII in the drain); "`NEXT_PUBLIC_RESEND_KEY` is fine, it's
client-triggered" (now public); "we'll add bounce handling later" (later is after you're
blocklisted); "RHF already validated it" (the webhook and retries never touched RHF).

---

## When to Use

- Sending a verification, password-reset, magic-link, notification, or receipt email.
- Wiring a Resend-class HTTP email provider into the edge app for the first time.
- Adding a transactional template (React Email) whose variables come from a tRPC mutation.
- Handling delivery events: processing bounce/complaint webhooks and a suppression list.

## When NOT to Use

- Marketing campaigns, newsletters, or audience/segment management → a different consent +
  unsubscribe + CAN-SPAM regime; build it as its own feature, not here.
- The in-app notification UI (bell, badges, a feed) → build it as a `vertical-slice`.
- Operational/diagnostic stdout logging in general → `log-discipline` owns levels and sampling.
- Validating env vars across the app → `env-validation` (this skill consumes it for the key).

---

## Procedure

1. **Build the edge-safe HTTP send client (medium).** No Node `net`/`tls` at the edge, so
   `nodemailer`/SMTP is out — the client is a typed `fetch` to the provider's REST endpoint with
   the key from validated server env (Rule 9), an explicit `from`/`reply_to`, and the response
   parsed into a typed `{ id }` (no untyped `JSON.parse`, Rule 1). See `references/email-client.md`.

2. **Author the template as typed React Email (low).** Render `@react-email/render` to HTML
   server-side; props are a TypeScript type so a missing variable is a compile error, not a
   blank inbox. Keep secrets and full rows out of the props (Rule 9). See `references/email-client.md`.

3. **Define one shared Zod schema for the send payload (high — Rule 8).** Recipient (strict
   email), template id, and variables get one schema, parsed at the tRPC input *and* re-parsed in
   the send helper — validated even when sourced from `ctx.auth`, because webhooks and retries
   bypass the form. See `references/email-client.md`.

4. **Make the send idempotent and tie it to its trigger (high).** Key the send to the triggering
   event (order id for a receipt, token id for verification) so a retried mutation or redelivered
   webhook sends exactly once; record `provider_message_id` + UTC `sent_at` (Rule 6) against it.
   Record the keying choice in `DECISIONS.md`. See `references/email-client.md`.

5. **Send outside the critical transaction (medium).** The mutation commits its state first (the
   order, the token row), then sends — a provider 500 must not roll back the purchase. A typed
   `TRPCError` is for *caller* errors (invalid recipient) only; an outage is logged and retried,
   never thrown at the user. See `references/email-client.md`.

6. **Handle bounce/complaint webhooks and maintain a suppression list (high — Rule 8).** Verify
   the webhook signature (Svix-class) before trusting it, Zod-parse the body, and on a hard bounce
   or complaint add the address to a suppression table the send client checks first — mailing
   known-bad addresses is what blocklists the domain. See `references/deliverability-and-webhooks.md`.

7. **Set deliverability basics and log without PII (low).** SPF/DKIM/DMARC are DNS/infra (runbook,
   not code); in code, send from a verified subdomain with a real `reply_to`, and make every log
   line `email.sent`/`email.bounced` + message id + hashed user id — never the address or body.
   See `references/deliverability-and-webhooks.md`.

---

## Composes With

- **Consumes:** `env-validation` — the provider API key and webhook signing secret are Zod-parsed
  there as server-only vars (Rule 9); this skill reads the typed values.
- **Consumes:** `zod-schema-library` — the send-payload and webhook-body schemas live with the
  shared schemas; the recipient/email validator is reused, not re-declared.
- **Pairs with:** `log-discipline` — it owns the leveled/sampled logger; this skill adds the hard
  constraint that no address, subject, or body is ever a log field.
- **Pairs with:** `clerk-auth-flows` — Clerk sends its own verification/reset email; use this
  skill for *product* email, and only override Clerk's when you own the template.
- **Hands off:** suppression/email tables on a live schema → `migration-author`; a durable "we
  emailed the user" compliance record → `audit-log-pattern`; the triggering feature → `vertical-slice`.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent told to build it the
> normal way, no project conventions): "add transactional email (verify-email + receipt) to a
> Next.js edge app." The imagined catastrophe (nodemailer/SMTP, key in `NEXT_PUBLIC_*`, full body
> to `console`) did NOT occur — a capable base model is better than that. A **narrower** failure
> class was confirmed.

**Observed run.** The agent produced a competent, mostly edge-correct build: a `fetch` client to
Resend (not nodemailer), the key from validated server env, a Zod-parsed provider response *and*
a Svix-verified Clerk webhook, idempotency keys on both sends, `timestamptz` columns, integer-cent
money formatted at the render edge, and sends after commit so an outage can't fail a paid order.
Three load-bearing disciplines were missing:

```ts
// 1. Delivery events absent — only the inbound Clerk user.created webhook exists. No
//    bounce/complaint handler, no suppressed_emails table => mails a bouncing address forever.
// 2. PII still reaches the drain — a *masked* address (not a hashed id) on every send:
logger.info("receipt_email.sending", { orderId, email: maskEmail(order.email) }); // "ja***@acme.com" leak
// 3. The send client trusts its recipient — `to: string`, never re-parsed in sendEmail() (Rule 8).
```

**Failure class (confirmed, narrowed).** Not "produces garbage" — "produces a plausible sender and
skips the deliverability and leak disciplines." The base model ships the happy path, then (a)
builds **no bounce/complaint handling or suppression list**, (b) logs a **partially-masked
address** (still PII) every send, and (c) **trusts the recipient** at the send boundary. This
skill adds the missing half: signed delivery webhooks + a suppression list, no email-derived
field in any log line, and a Zod re-parse of the recipient at the send client.

---

## Examples

**Input:** "When a user signs up, email them a verification link."
**Output:** A one-time token row (UUIDv7 id, `expires_at timestamptz`, Rule 6) is written, then
`sendEmail({ to: schema.parse(user.email), template: "verify-email", vars: { url }, idempotencyKey: token.id })`
renders the template server-side and POSTs via the edge `fetch` client. The log line is
`email.sent` + `{ messageId, userId: hashUserId(...) }`, no address. (If Clerk owns sign-up, prefer
its native verification — see Edge Cases.)

**Input:** "Email a receipt after checkout with line items and the total."
**Output:** The checkout mutation commits the order first, then sends with `idempotencyKey:
order.id` so a tRPC retry can't double-send. The total is formatted from integer minor units at
the template edge (`money-modeling`, Rule 5), not a float. A provider outage logs `email.failed`
+ order id and retries — it never rolls back the paid order.

**Input:** "Stop emailing addresses that keep bouncing."
**Output:** A `POST /api/webhooks/resend` route verifies the Svix signature, Zod-parses the event,
and on a hard `email.bounced` / `email.complained` inserts the address into a `suppressed_emails`
table the send client checks first and short-circuits on — logging `email.bounced` + message id,
never the address.

---

## Edge Cases

- **Clerk already sends the verification/reset email** → don't reimplement it; let
  `clerk-auth-flows` own auth-lifecycle email. Use this skill for product email (receipts,
  notifications) or when you deliberately take over Clerk's template.
- **The provider is down or rate-limits mid-send** → never throw its 500 at the user or roll back
  committed state; log `email.failed` + the triggering id and retry with the same idempotency key.
- **The same webhook is delivered more than once** (at-least-once delivery) → make the handler
  idempotent on the provider event id, and verify the signature before any work (Rule 8).
- **A user updates their email after the token was issued** → validate the *current* address at
  send time, not the one captured when the token was minted; re-parse with the shared schema.

## References

- `references/email-client.md` — the edge-safe `fetch` send client (why not nodemailer/SMTP),
  the key from validated server env, `from`/`reply_to`, React Email server rendering, the shared
  Zod send-payload schema, the idempotency-key pattern, and send-after-commit.
- `references/deliverability-and-webhooks.md` — SPF/DKIM/DMARC as infra vs. code, signed
  bounce/complaint webhook verification (Svix-class), the Zod-parsed event body, the suppression
  table + pre-send check, and the no-PII log fields for delivery events.

## Scripts

`scripts/` is reserved (`.gitkeep`). A signal that would justify one: a static check grepping the
diff for `nodemailer`/SMTP imports under the edge runtime, `NEXT_PUBLIC_*` on a provider key, or a
`console.*` line containing an email-shaped field or rendered template — the leak and
wrong-transport mistakes caught mechanically. Until that recurs, this skill stays script-free.
