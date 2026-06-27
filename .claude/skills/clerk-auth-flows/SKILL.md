---
name: clerk-auth-flows
description: >
  Wire Clerk on the edge runtime the decided way: clerkMiddleware with a correct route
  matcher, catch-all sign-in/sign-up pages, organization-scoped auth, and Svix-verified
  webhooks whose payloads are Zod-parsed before they touch Drizzle. Gets the genesis auth
  layer right so features inherit a trustworthy ctx.auth instead of re-implementing auth.
  Use when: "set up auth", "clerk middleware", "sign in flow", "clerk webhook",
  "organizations".
  Do NOT use for: per-resource ownership checks inside a procedure (use vertical-slice), or
  the header/security review of the finished auth surface (use security-pass).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the edge-Clerk failure class: unverified/unparsed webhooks
    and leaky middleware matchers. Baseline section is the encoded failure class; replace
    with an observed transcript.
---

# clerk-auth-flows

The genesis auth layer for the edge stack. Clerk is wired once via `clerkMiddleware`, and
every feature thereafter trusts `ctx.auth` rather than re-implementing sign-in. This skill
covers the four places auth is actually configured — middleware, the sign-in/up pages,
organizations, and webhooks — and the two failure-prone ones (the matcher and the webhook
boundary) where generated code compiles but is wrong.

Spine and rules live in `../../CLAUDE.md` (Auth, Rules 2/8/9). This skill obeys them and does
not restate them.

---

## Non-Negotiable Rules

These exist because the defect ships in code that compiles and returns 200:

- **Never trust a webhook body before verifying its Svix signature.** Construct `Webhook`
  with `CLERK_WEBHOOK_SIGNING_SECRET`, `verify()` the raw body against the `svix-id` /
  `svix-timestamp` / `svix-signature` headers, and only then read it. An unverified handler
  is a public write endpoint for anyone.
- **Never feed a webhook payload into Drizzle without Zod-parsing it first (Rule 8).** The
  verified body is still `unknown`. Parse it to the event shape before any DB write.
- **Never put a Clerk secret in `NEXT_PUBLIC_*` or a Client Component (Rule 9).** Only the
  publishable key is public; `CLERK_SECRET_KEY` and the webhook secret are server-only and
  Zod-validated at the env boundary (Rule 8).
- **Never write a route matcher that leaves `/api` or `/trpc` uncovered.** A matcher that
  skips your API routes silently disables auth on the exact surface that mutates data.

Refuse these rationalizations: "the endpoint is obscure, signature check later"; "the body
is already typed by the SDK so Zod is redundant"; "the webhook secret in `NEXT_PUBLIC_` is
fine, it's just a webhook"; "the default Next matcher is good enough."

---

## When to Use

- Standing up auth at project genesis, or adding sign-in/sign-up to an existing edge app.
- Adding Clerk **organizations** (multi-tenant `orgId` / `orgRole`) to the auth model.
- Building or fixing a **Clerk webhook** that syncs users/orgs into Drizzle.
- Auditing or correcting the `middleware.ts` route matcher.

## When NOT to Use

- Checking that a specific row belongs to `ctx.auth.userId` inside a query/mutation (Rule 2)
  → that lives in the feature, use `vertical-slice`.
- Threat-modeling the finished auth surface, header verification, dep scan → `security-pass`.
- Designing the tRPC `protectedProcedure`/middleware layer itself → `trpc-middleware`.
- Modeling the `users`/`organizations` tables the webhook writes to → `schema-design`.

---

## Procedure

1. **Validate the auth env at the boundary first (high — Rule 8/9).** Add
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`,
   and the sign-in/up URL vars to the Zod env schema; keep secrets out of `NEXT_PUBLIC_*`.
   See `references/middleware-and-auth.md`.
2. **Write `middleware.ts` with `clerkMiddleware` + `createRouteMatcher` (high).** Declare
   public routes explicitly, `await auth.protect()` everything else, and ship the matcher
   that covers `/(api|trpc)(.*)` while skipping static assets. This is the line that most
   often leaks. See `references/middleware-and-auth.md`.
3. **Add the catch-all sign-in/sign-up pages (low).** `app/sign-in/[[...sign-in]]/page.tsx`
   and the matching sign-up route rendering `<SignIn />`/`<SignUp />`, wrap the app in
   `<ClerkProvider>`. URLs come from env, not hardcoded.
4. **Wire `ctx.auth` into the tRPC context (medium).** Read `auth()` in the context factory
   so `protectedProcedure` can assert `ctx.auth.userId` (and `orgId` when org-scoped). The
   ownership check on top of it is `vertical-slice`'s job, not this skill's.
5. **Add organizations if multi-tenant (medium).** Mount `<OrganizationSwitcher />`, decide
   personal-vs-org scoping, and carry `orgId`/`orgRole` into context. Record the tenancy
   model in `DECISIONS.md` — it shapes every later ownership check.
6. **Build the webhook as a verify→parse→sync pipeline (high — Rules 8/2).** Svix-verify the
   raw body, Zod-parse the event, branch on `type`, and upsert into Drizzle idempotently. Set
   the route's runtime and return 4xx on bad signature, 2xx only after a successful write.
   See `references/webhooks.md`.
7. **Record forks, hand off to the gates.** Tenancy model and any deviation → `DECISIONS.md`;
   then run `rule-audit` and `security-pass` over the new surface.

---

## Composes With

- **Consumes:** the Zod env schema and `ClerkProvider` wiring from `t3-genesis`.
- **Feeds:** `ctx.auth` (userId/orgId) into every `protectedProcedure` built by
  `vertical-slice` and `trpc-middleware`.
- **Pairs with:** `security-pass` (audits the finished auth surface), `vertical-slice` (adds
  the per-row ownership check on top), `trpc-middleware` (defines `protectedProcedure`).
- **Hands off:** the `users`/`organizations` schema the webhook writes to → `schema-design`;
  the resolved tenancy fork → `DECISIONS.md`.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent told to implement as
> a typical dev would, with no project conventions). The encoded failure class was confirmed.

**Observed run.** Prompt: "Build a Clerk webhook that verifies the signature and syncs new users into our DB." With no skill the agent produced:

```ts
const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET as string);
let evt: any;
try {
  evt = wh.verify(body, { "svix-id": svixId, "svix-timestamp": svixTimestamp, "svix-signature": svixSignature });
} catch (err) { return new Response("Invalid signature", { status: 400 }); }
if (evt.type === "user.created") {
  const { id, email_addresses, first_name, last_name } = evt.data;
  await db.insert(users).values({ clerkId: id, email: email_addresses[0]?.email_address, firstName: first_name, lastName: last_name, createdAt: new Date() });
}
```

Its own note: *"Verify the svix signature with the webhook secret, then insert on the user.created event — kept the handler thin and inline."* — the verified body is typed `any` and never Zod-parsed (Rules 1 and 8), the secret is read with `as string` instead of through the Zod env boundary (Rule 8), and `email_addresses[0]` is dereferenced unchecked so a null email can land in the DB.

**Failure class (confirmed).** A Svix-verified webhook still carries an `unknown` payload, but the naive handler treats verification as the whole job — typing the event `any`, skipping the Zod parse, and trusting `process.env` and array indexing directly. The result compiles and returns 200 even when it writes garbage (or fails to write at all, since the swallowed insert never signals Clerk to retry). This skill forces verify → Zod-parse → idempotent upsert so the boundary is both authenticated and type-safe.

---

## Examples

**Input:** "Set up auth and a webhook that creates a row in our users table when someone
signs up."
**Output:** Env vars Zod-validated (secret server-only) → `middleware.ts` with
`clerkMiddleware`, public routes for `/`, `/sign-in`, `/sign-up`, and the matcher covering
`/(api|trpc)(.*)` → catch-all sign-in/up pages → webhook at `app/api/webhooks/clerk/route.ts`
that Svix-`verify()`s, Zod-parses the `user.created` event, and `insert().onConflictDoNothing()`
into `users` keyed by Clerk `id` (idempotent). Hands the ownership-check work to
`vertical-slice`.

**Input:** "Make this a multi-tenant app with teams."
**Output:** Enables Clerk organizations, mounts `<OrganizationSwitcher />`, carries
`orgId`/`orgRole` into `ctx.auth`, and records in `DECISIONS.md` that resources are
org-scoped (so every later ownership check is `row.orgId === ctx.auth.orgId`, not just
userId). Adds `organization.created`/`organizationMembership.*` cases to the webhook.

---

## Edge Cases

- **Webhook fires before the local `users` row exists (FK violation on a child write)** →
  upsert the user on `user.created` and make child handlers tolerant; don't assume ordering.
- **Svix `verify` throws on the edge runtime** → if a polyfill gap bites, verify via Web
  Crypto HMAC and record it in `DECISIONS.md`. See `references/webhooks.md`.
- **A route must be public but sits under a protected prefix** (e.g. a marketing page under
  `/app`) → add it to `createRouteMatcher`'s public list explicitly; never widen the matcher.
- **`auth()` returns no `orgId` for a personal-account user in an org-scoped app** → decide
  the fallback (reject vs. personal workspace) and encode it once in context, not per route.

---

## References

- `references/middleware-and-auth.md` — env validation, `clerkMiddleware`/matcher, sign-in/up
  pages, `<ClerkProvider>`, organizations, and wiring `auth()` into the tRPC context.
- `references/webhooks.md` — the Svix verify→Zod-parse→Drizzle-upsert pipeline, event Zod
  schemas, idempotency, and edge-runtime caveats.

## Scripts

- Reserved (`scripts/.gitkeep`). A `verify-matcher.mjs` that statically checks `middleware.ts`
  covers `/(api|trpc)(.*)` and that no `CLERK_*` secret appears under `NEXT_PUBLIC_` would
  justify a script; until the matcher patterns stabilize, this stays a manual `rule-audit` check.
