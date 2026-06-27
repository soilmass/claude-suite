Purpose: the edge-incompatibility checklist for the DB seam — what compiles in dev and fails at edge deploy, and the correct replacement for each.

# Edge pitfalls

The edge runtime has no TCP sockets, no `node:net`/`node:dns`, no Node `Buffer`-everywhere
guarantees, and a fresh isolate per invocation with no shared connection state. These are the
DB-seam failures that pass `next dev` (Node) and then 500 on deploy.

---

## Banned at the edge — swap on sight

| If you see…                                    | Why it fails               | Use instead                          |
| ---------------------------------------------- | -------------------------- | ------------------------------------ |
| `import { Pool } from "pg"` / `pg` `Client`    | opens a TCP socket (`net`) | `drizzle-orm/neon-http` + `neon()`   |
| `import postgres from "postgres"` (postgres.js)| TCP socket                 | `drizzle-orm/neon-http`              |
| `import mysql from "mysql2"`                    | TCP socket                 | an HTTP MySQL driver (or move off edge) |
| `import { Pool } from "@neondatabase/serverless"` (WS) | holds a WebSocket connection | `neon()` HTTP client          |
| `new Database(...)` (better-sqlite3)           | native `fs`/addon          | `@libsql/client` + `drizzle-orm/libsql` |

Tell at the symptom level: errors like `Cannot find module 'net'`, `dns.lookup is not a
function`, or a route that hangs then times out **only** on the deployed edge.

---

## No interactive transactions over HTTP

The HTTP drivers cannot hold a session open across awaits, so the interactive form silently
breaks atomicity (or throws):

```ts
// ❌ no session to hold the transaction over HTTP
await db.transaction(async (tx) => {
  await tx.insert(orders).values(o);
  await tx.update(inventory).set({ qty: sql`qty - 1` });
});
```

Options, in order of preference:
1. **Batch form** — Neon HTTP and libSQL support an array/batch `transaction([...])` of
   queries that ship together. Use it when the statements don't depend on each other's results.
2. **Restructure** — collapse to a single statement (CTE / `INSERT ... RETURNING` feeding the
   next), so atomicity isn't needed.
3. **Node route** — if true interactive atomicity is required, put that one path on
   `export const runtime = "nodejs"` with a Node driver, and record the split in `DECISIONS.md`.

---

## Pooled vs direct connection strings

Neon (and similar) expose two hosts:
- **Pooled** (`...-pooler...`): for serverless/edge runtime traffic — many short-lived calls.
- **Direct**: for migrations, long transactions, schema introspection (`drizzle-kit`).

Map them deliberately: runtime `db` → the driver's intended URL; `drizzle.config.ts` →
direct. Do not paste one string into both without checking. Wrong mapping shows up as
connection-limit errors under load or migration timeouts.

---

## Verification checklist (do before calling it done)

- [ ] No banned TCP driver anywhere in the import graph of `src/db/` (grep the table above).
- [ ] `DATABASE_URL` (and Turso `DATABASE_AUTH_TOKEN`) is Zod-parsed in `env.ts`, server-only,
      no `NEXT_PUBLIC_` prefix (Rules 8, 9).
- [ ] `db` is constructed from `neon-http` or `libsql`, module-level, not wrapped in a pool.
- [ ] Every route/handler touching `db` declares `export const runtime = "edge"` (unless an
      explicit Node split is recorded in `DECISIONS.md`).
- [ ] A real query succeeds on a **preview deploy**, not just `next dev`.
- [ ] No interactive `db.transaction(async tx => …)`; batched or restructured instead.
- [ ] The type chain from `schema` → `db` → caller has no `any`/`@ts-ignore` (Rule 1).

Run `rule-audit` over the diff afterward to catch Rules 1/8/9 mechanically.
