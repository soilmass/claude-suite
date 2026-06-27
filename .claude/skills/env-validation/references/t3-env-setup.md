Purpose: the canonical `@t3-oss/env-nextjs` setup — `createEnv` config, `runtimeEnv` mapping, build-time wiring, and the edge static-inlining constraint.

# The env module (`src/env.ts`)

```ts
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Server-only. Never sent to the browser. A secret MUST live here, never in `client`.
   * (Rule 9.) Accessing any of these from a Client Component is a build-time error in t3-env.
   */
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().url(),
    CLERK_SECRET_KEY: z.string().min(1),
    CLERK_WEBHOOK_SECRET: z.string().min(1),
    STRIPE_SECRET_KEY: z.string().startsWith("sk_"),
  },

  /**
   * Client-exposed. EVERY key here MUST be prefixed `NEXT_PUBLIC_` (enforced by
   * `clientPrefix` below). These ship to the browser bundle in plaintext — nothing
   * sensitive. (Rule 9.)
   */
  client: {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().startsWith("pk_"),
    NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1),
    NEXT_PUBLIC_APP_URL: z.string().url(),
  },

  clientPrefix: "NEXT_PUBLIC_",

  /**
   * runtimeEnv: maps each schema key to its source. CRITICAL for the edge — Next inlines
   * `process.env.NEXT_PUBLIC_*` by *static* analysis at build, so each client value must be
   * referenced LITERALLY here. Do NOT spread `...process.env` and do NOT compute keys; an
   * edge route / middleware cannot read a client var that was not statically present.
   */
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    CLERK_WEBHOOK_SECRET: process.env.CLERK_WEBHOOK_SECRET,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },

  /** Treat `FOO=` (blank) as missing, so a `.min(1)` var fails instead of passing as "". */
  emptyStringAsUndefined: true,

  /** Docker / CI build-layer escape hatch ONLY. Record in DECISIONS.md if used; never in a
   *  running container. */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
```

> Note: `experimental__runtimeEnv` is the older split form where server vars were read from
> `process.env` automatically and only client vars were listed. Recent `@t3-oss/env-nextjs`
> uses a single `runtimeEnv` listing all keys (shown above). If you pin an older version,
> match its documented field name — this is a perishable detail; `perishable-refresh` owns it.

# Build-time wiring (`next.config.ts`)

Importing the env module from the Next config forces evaluation during `next build`, so a
missing/malformed variable aborts the build instead of crashing an edge request later.

```ts
import { fileURLToPath } from "node:url";
import createJiti from "jiti";

// Validate env at build time. jiti lets the TS env module be imported from this config.
const jiti = createJiti(fileURLToPath(import.meta.url));
await jiti.import("./src/env");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ...
};
export default nextConfig;
```

This is the line that turns "validated at first use" into "validated at build" — the whole
point of the fail-fast contract.

# Importing in app code

```ts
import { env } from "@/env";

// Server (route handler / tRPC / server component):
const db = drizzle(env.DATABASE_URL);

// Client component — only NEXT_PUBLIC_* keys resolve; importing a server key here is a
// build error surfaced by t3-env, which is the guardrail you want (Rule 9).
posthog.init(env.NEXT_PUBLIC_POSTHOG_KEY);
```

Never reintroduce `process.env.X` in app code; the typed `env` object is the single source.

# `.env.example` (committed; values blank)

Keep a key-only template in sync with the schema so the next developer knows what to set:

```
NODE_ENV=
DATABASE_URL=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=
STRIPE_SECRET_KEY=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_APP_URL=
```

The real `.env` / `.env.local` stays gitignored. `secret-scan` checks nothing real leaked in.
