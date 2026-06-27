Purpose: trace the App Router Server/Client boundary and the leak patterns that drag server code into the browser.

# Server/Client boundary leaks

## The model
In App Router, **everything is a Server Component until proven otherwise.** A module enters the
client bundle only if it is reachable from a `"use client"` entry point. That directive marks a
*boundary*, not a file: every module the marked file imports — and everything *those* import,
transitively — ships to the browser. The client bundle is exactly this import closure.

So the question is never "is this file client?" but "what does the closure of each `"use client"`
entry drag in?"

## Tracing the closure
1. Find the entry points: `grep -rl '"use client"' src/` (or `'use client'`).
2. For each, walk its imports. Anything ending up in the closure that is conceptually server-only
   is a leak.
3. Confirm against the analyzer `client` treemap — a server module showing up there is the leak,
   visible as bytes.

## The common leaks (each compiles; each costs bytes)

### 1. Importing the tRPC router instead of the client
```ts
// LEAK — pulls the whole server: routers, Drizzle, db, validators
import { appRouter } from "~/server/api/root";
type Out = ReturnType<typeof appRouter...>;
```
```ts
// FIX — the typed client is browser-safe; the type is erased (zero bytes)
import { api } from "~/trpc/react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "~/server/api/root"; // import TYPE — erased at build
type Out = inferRouterOutputs<AppRouter>["post"]["list"];
```
`import type` is erased and costs nothing; a value import of the router drags the server graph
across. This is the single most common cause of a blown client bundle in this stack.

### 2. Importing the Drizzle schema or `db` from a Client Component
The schema module and the `db` instance (and its driver) are server-only. Reaching them from a
client entry pulls Drizzle and the DB driver into the browser — dead weight, and on the edge often
an outright build error. Pass query *results* down as props from a Server Component, or fetch via
the tRPC client; never import `~/db/*` across the boundary. (Types: `import type` the inferred row
type, which is erased.)

### 3. Env and server SDKs
`import { env } from "~/env"` (server keys), a Clerk *server* helper, Sentry's node SDK, or any
`node:*` import reachable from a client entry is a leak. Server secrets in the client graph are
also a Rule 9 violation — when you see one, hand the secret question to `secret-scan`; this skill
only flags that it crossed.

### 4. Barrel imports that defeat tree-shaking
```ts
import { Pencil } from "lucide-react";        // barrel — may pull siblings
import * as Icons from "~/components/icons";   // pulls every icon
```
Prefer the per-module path (`lucide-react/icons/pencil` where supported) or a curated re-export.
Verify in the treemap that only what you use ships.

## Where the boundary belongs
Push the `"use client"` boundary **as far down the tree as possible.** A page that is mostly static
with one interactive widget should be a Server Component that renders a small Client island for the
widget — not a wholesale `"use client"` at the top that conscripts the entire subtree (and its
imports) into the bundle. Server-fetch the data, pass it as props, keep interactivity local.

Record any non-obvious boundary placement in `DECISIONS.md` so the next person doesn't "fix" it back.
