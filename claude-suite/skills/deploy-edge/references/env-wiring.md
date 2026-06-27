Purpose: environment-variable wiring for Vercel deploys of the edge stack — the scope matrix, the NEXT_PUBLIC_ inlining rule (Rule 9), Sensitive vars, pulling env locally, and the Zod env-validation boundary (Rule 8) with the stack's expected keys.

# The scope matrix

Vercel binds each env var to one or more **environments**. Choosing scope is mandatory — an
unscoped var that lands in all environments leaks production credentials into every preview URL.

| Environment   | Used by                                  | Credentials to use                          |
|---------------|------------------------------------------|---------------------------------------------|
| Production    | the live production deployment           | production keys / production DB              |
| Preview       | every branch/PR preview deployment       | **non-prod** keys / a preview DB branch     |
| Development   | `vercel dev` / pulled into `.env.local`  | local/dev keys                              |

Set via dashboard (Project → Settings → Environment Variables) or CLI:
- `vercel env add <NAME> production` (prompts for value; repeat per scope, distinct values).
- `vercel env ls` — list keys per scope (values of Sensitive vars are not shown).
- `vercel env rm <NAME> <scope>`.

Env vars bind **at build time per environment**. If you add a var after a build, that build
can't see it — redeploy in the matching scope.

# NEXT_PUBLIC_ is a client-bundle inline (Rule 9)

Any var named `NEXT_PUBLIC_*` is **statically inlined into the JavaScript shipped to the
browser** at build time. That is the entire mechanism — there is no runtime read, no server
boundary. Therefore:

- A secret with a `NEXT_PUBLIC_` prefix is published to every visitor. Never do this. (Rule 9.)
- Only genuinely public config belongs in `NEXT_PUBLIC_` (e.g. the Clerk *publishable* key,
  a public site URL, a public analytics id).
- Everything secret stays unprefixed and is read **only** in server code (route handlers,
  tRPC procedures, server components) — never imported into a Client Component.

# Sensitive vars

Mark secrets **Sensitive** in Vercel. A Sensitive var's value cannot be read back from the
dashboard or API after it's set — it can only be overwritten. This blocks accidental exfil of
prod secrets through the project UI. Use it for every server secret (DB URL, Clerk secret key,
webhook signing secrets, third-party API keys).

# Pulling env for local work

`vercel env pull .env.local` writes the **Development**-scoped vars into `.env.local`
(gitignored). Use this to mirror config locally instead of hand-copying secrets. Never commit
`.env*` files.

# Validate the boundary with Zod (Rule 8)

Env vars are an external input — Zod-parse them once, at module load, and import the typed,
validated object everywhere instead of touching `process.env` directly. Pair with the
`env-validation` skill (`@t3-oss/env-nextjs` or a hand-rolled Zod schema). This makes a missing
or malformed var a **build-time** failure with a named key, not a 2am runtime `undefined`.

```ts
// src/env.ts — single validated source; server vs client split enforces Rule 9
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),        // Neon/Turso HTTP URL — secret, server-only
    CLERK_SECRET_KEY: z.string().min(1),   // secret, server-only, Sensitive
    CLERK_WEBHOOK_SECRET: z.string().min(1),
  },
  client: {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1), // public by design
    NEXT_PUBLIC_APP_URL: z.string().url(),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    CLERK_WEBHOOK_SECRET: process.env.CLERK_WEBHOOK_SECRET,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
});
```

The `server`/`client` split is the structural guard for Rule 9: a server key cannot be
referenced from client code without a type error, and only `NEXT_PUBLIC_`-prefixed keys are
allowed in the `client` block.

# Expected key set for this stack (per scope)

- `DATABASE_URL` — Neon serverless / Turso libSQL HTTP URL (secret, Sensitive). Preview should
  point at a separate DB branch/instance from production.
- `CLERK_SECRET_KEY` — Clerk backend key (secret, Sensitive). Preview uses Clerk's
  development/preview instance, production uses the production instance.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — Clerk frontend key (public by design).
- `CLERK_WEBHOOK_SECRET` — verifies inbound Clerk webhooks (secret); the webhook body is itself
  a validated boundary (Rule 8).
- `NEXT_PUBLIC_APP_URL` — public base URL; differs per environment (preview URL vs prod domain).
- Any third-party API keys (email, payments, etc.) — server-only, Sensitive, distinct values
  per scope.
