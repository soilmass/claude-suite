# Scaffold layout & edge-specific wiring

The layout is standard App-Router T3; the *wiring* differs because we're on the edge
(DECISIONS.md). The edge-specific parts are what a generic scaffold gets wrong.

## Directory layout
```
src/
  app/                      # App Router ONLY — no pages/
  db/
    index.ts                # serverless driver + drizzle() client
    schema/                 # schema-design output, one file per aggregate
  server/
    api/
      trpc.ts               # context (Clerk auth on ctx), procedures
      routers/              # vertical-slice output
  features/                 # per-feature shared Zod schemas + logic functions
  styles/
    globals.css             # design-tokens @theme block
middleware.ts               # Clerk EDGE middleware
drizzle.config.ts           # drizzle-kit config
CLAUDE.md  DECISIONS.md      # guard files at root
.github/workflows/ci.yml    # the gates
```

## Edge wiring that a generic scaffold gets wrong

**Clerk edge middleware** (not the Node variant):
```ts
// middleware.ts
import { clerkMiddleware } from "@clerk/nextjs/server";
export default clerkMiddleware();
export const config = { matcher: ["/((?!_next|.*\\..*).*)", "/api/(.*)"] };
```

**Serverless DB driver** (no long-lived pool — DECISIONS.md):
```ts
// src/db/index.ts  (Neon example; Turso/libSQL analogous)
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";
export const db = drizzle(neon(process.env.DATABASE_URL!), { schema });
```

**tRPC context puts Clerk auth on ctx** so `protectedProcedure` and ownership checks work:
```ts
import { auth } from "@clerk/nextjs/server";
export async function createContext() {
  const a = await auth();            // { userId, ... }
  return { db, auth: a };
}
```

**Edge route handlers** mark the runtime:
```ts
export const runtime = "edge";
```

## CI gates seeded (.github/workflows/ci.yml)
- rule-audit `scan.mjs` (mechanical pass) on the diff
- a11y-gate (axe) on built routes
- security-pass checklist + dependency scan
- performance budget: LCP/INP/CLS at p75, build-failing
