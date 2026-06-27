Purpose: copy-ready, edge-correct Drizzle client construction for Neon HTTP and Turso/libSQL, with Zod server-env validation and the `drizzle.config.ts` per dialect.

# Driver setup

The runtime client and the migration tooling are two connections with two jobs. The client
runs at the **edge** and must be stateless HTTP. `drizzle-kit` runs in **Node** (CI/local)
and may use a direct connection string. Keep them separate.

---

## 1. Validate the secret at the boundary (Rule 8, Rule 9)

Connection strings are secrets. Server-only — never `NEXT_PUBLIC_*`. Parse before use so a
missing/malformed value is a boundary error, not a deep runtime crash.

Pick the schema for your dialect. The auth token is **required for Turso** — leaving it
`.optional()` lets a missing token pass validation and fail later as a silent auth error,
which is exactly the Rule 8 violation this boundary exists to prevent.

```ts
// src/env.ts  — the only place env is read
// NEON: postgres URL, no auth token.
import { z } from "zod";

const serverEnv = z.object({
  DATABASE_URL: z.string().url(), // postgres://...
});

export const env = serverEnv.parse(process.env);
```

```ts
// src/env.ts  — the only place env is read
// TURSO: libsql:// URL + a REQUIRED auth token (not optional).
import { z } from "zod";

const serverEnv = z.object({
  DATABASE_URL: z.string().url(),      // libsql://<db>-<org>.turso.io
  DATABASE_AUTH_TOKEN: z.string().min(1), // required — no .optional()
});

export const env = serverEnv.parse(process.env);
```

Import `env` everywhere; never touch `process.env` again. A `t3-env`-style split (server vs
`NEXT_PUBLIC_` client schema) is the genesis default — this slots into its server block.

---

## 2a. Neon serverless (Postgres) — the HTTP driver

```bash
pnpm add @neondatabase/serverless drizzle-orm
pnpm add -D drizzle-kit
```

```ts
// src/db/index.ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { env } from "~/env";
import * as schema from "./schema"; // from schema-design

// `neon()` is a STATELESS HTTP client: every query is a fetch, no socket is held.
// A module-level singleton is correct here — there is no pool to exhaust at the edge.
const sql = neon(env.DATABASE_URL);

export const db = drizzle(sql, { schema });
```

Do NOT use the WebSocket pool form at the edge:

```ts
// ❌ holds connections over a WebSocket — wrong target for stateless edge invocations
import { Pool } from "@neondatabase/serverless";
const pool = new Pool({ connectionString: env.DATABASE_URL });
```

The WS `Pool` exists for Node/long-lived contexts. At the edge, prefer `neon-http`.

---

## 2b. Turso / libSQL (SQLite) — the libsql driver

```bash
pnpm add @libsql/client drizzle-orm
pnpm add -D drizzle-kit
```

```ts
// src/db/index.ts
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { env } from "~/env";
import * as schema from "./schema";

const client = createClient({
  url: env.DATABASE_URL,            // libsql://<db>-<org>.turso.io
  authToken: env.DATABASE_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });
```

libSQL speaks HTTP/WebSocket to Turso — no TCP socket, edge-safe. SQLite dialect changes
column types downstream (e.g. `integer({ mode: "timestamp" })`, money as `integer`), so
record the dialect in `DECISIONS.md` for schema-design to honor.

---

## 3. drizzle.config.ts (migration tooling, runs in Node)

Neon / Postgres:

```ts
import { defineConfig } from "drizzle-kit";
import { env } from "./src/env";

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Migrations run in Node — a DIRECT (non-pooled) URL is preferred if Neon gave one.
  dbCredentials: { url: env.DATABASE_URL },
});
```

Turso / SQLite:

```ts
import { defineConfig } from "drizzle-kit";
import { env } from "./src/env";

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "sqlite",
  driver: "turso",
  dbCredentials: { url: env.DATABASE_URL, authToken: env.DATABASE_AUTH_TOKEN },
});
```

Generate with `drizzle-kit generate`; review the SQL; hand applying off to migration-author.
Never reuse the edge runtime client for migrations and never auto-apply destructively in CI.

---

## 4. Force the edge runtime where `db` is touched

```ts
// app/api/.../route.ts  (or a tRPC edge handler)
export const runtime = "edge";
```

`next dev` runs Node, so a TCP-pool mistake hides locally. Verify a real query on a preview
deploy, not just dev. The type chain (Rule 1) stays intact: `db` is fully typed from the
`schema` you passed, with no `any` between Drizzle inference and the caller.
