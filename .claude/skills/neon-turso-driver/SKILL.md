---
name: neon-turso-driver
description: >
  Wire the Drizzle database client to an edge-compatible serverless/HTTP driver — Neon
  serverless (`drizzle-orm/neon-http`) or Turso/libSQL (`drizzle-orm/libsql`) — so queries
  run natively in the Next.js edge runtime with no long-lived TCP pool. Covers the
  stateless per-request connection model, Zod-validated server-only env, the `drizzle.config.ts`
  dialect, and the edge pitfalls (TCP `Pool`, `node:net`, multi-statement transactions over
  HTTP) that compile fine and then fail at deploy.
  Use when: "set up the database driver", "neon driver", "turso driver", "connect drizzle at edge".
  Do NOT use for: schema modeling (use schema-design), genesis scaffolding (use t3-genesis).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the edge-incompatible-driver failure class: a node-postgres
    TCP pool or postgres.js client wired into a runtime that has no TCP sockets.
    Baseline observed (clean-room capture).
---

# neon-turso-driver

Stand up the `db` client so Drizzle talks to the database over a serverless HTTP driver that
survives the edge runtime. The edge target is the fork-defining fact in `../../CLAUDE.md`; a
TCP-pool driver (`pg.Pool`, `postgres()`) imports `node:net` and dies at deploy, not in dev.
This skill picks the right driver, validates its secret at the boundary, and keeps the
connection model stateless. It does not model tables (schema-design) or scaffold the repo
(t3-genesis) — it wires the one seam between them.

## Non-Negotiable Rules

- **Never** use a TCP-pool driver at the edge: no `pg`/`node-postgres` `Pool`, no
  `postgres` (postgres.js), no `mysql2`, no Neon **WebSocket** `Pool`. HTTP/serverless only.
- **Never** read `process.env.DATABASE_URL` raw — Zod-parse the server env first (Rule 8),
  and the var is server-only, never `NEXT_PUBLIC_*` (Rule 9).
- **Never** assume multi-statement interactive transactions work over the HTTP driver — they
  do not. Use the driver's batch/`transaction([...])` form or restructure.
- **Never** point the edge driver at a pooled-vs-direct URL by guesswork; migrations and
  the runtime client may need different connection strings.
- Refuse these rationalizations: "the pool works locally so it's fine" (dev is Node, edge is
  not), "I'll add env validation later" (the unparsed read is the bug), "it's just one
  transaction" (HTTP has no session to hold it).

## When to Use

- Right after the schema exists and before the first tRPC procedure needs `db`.
- Choosing or switching between Neon (Postgres) and Turso/libSQL (SQLite) at the edge.
- A query throws `node:net`/`dns`/`Cannot find module 'net'` or hangs only on Vercel edge.
- Setting up `drizzle.config.ts` and the migration connection alongside the runtime client.

## When NOT to Use

- Designing tables, relations, indexes — use schema-design (this consumes its output).
- Standing up the whole repo, CI, auth, tokens — use t3-genesis (this is one seam of it).
- Authoring a migration that evolves the schema — use migration-author.
- General edge-incompatible API usage (Node globals, `fs`, crypto) — see edge-runtime-constraints.

## Procedure

1. **Pick the driver from the database, not preference (interrogation: high).** Neon/Postgres
   → `@neondatabase/serverless` + `drizzle-orm/neon-http`. Turso/libSQL/SQLite →
   `@libsql/client` + `drizzle-orm/libsql`. The dialect cascades into `drizzle.config.ts`,
   the schema column types, and the migration tooling — getting it wrong is expensive. Record
   the choice and why in `DECISIONS.md`. See `references/driver-setup.md`.
2. **Validate the connection secret at the boundary (Rule 8, Rule 9).** Add the URL (and Turso
   `DATABASE_AUTH_TOKEN`) to the Zod server-env schema; import only the parsed object. Never
   `NEXT_PUBLIC_`-prefix a connection string. See `references/driver-setup.md`.
3. **Construct the stateless client.** Build `db` from the HTTP/serverless driver. The
   module-level singleton is correct here precisely because the driver is connectionless —
   each query is a `fetch`, so there is no pool to exhaust. Do not wrap it in a pool. See
   `references/driver-setup.md`.
4. **Wire the migration connection separately.** `drizzle.config.ts` runs in Node (CI/local),
   so it may use the same URL or a direct/non-pooled variant; keep migrations out of the edge
   client. Hands off applying them to migration-author.
5. **Force the runtime and verify it (interrogation: medium).** Confirm route handlers /
   server code that touch `db` declare `export const runtime = "edge"` and that a real query
   succeeds on a preview deploy — not just `next dev` (Node). See `references/edge-pitfalls.md`.
6. **Handle transactions deliberately.** If logic needs atomicity, confirm the driver supports
   it over HTTP (batch / array-form `transaction`), or move that work behind a path that can.
   Audit for the no-interactive-transaction trap. See `references/edge-pitfalls.md`.

## Composes With

- **Consumes:** schema-design (the `schema` object passed to `drizzle(...)`).
- **Pairs with:** t3-genesis (which seeds this seam at scaffold time), edge-runtime-constraints
  (the broader edge-compatibility surface this is one instance of).
- **Hands off:** migration-author (applying and evolving migrations through the config connection).
- **Runs against:** rule-audit (Rules 1, 8, 9 over the wiring you produce).

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project conventions). The encoded failure class was confirmed.

**Observed run.** Asked to wire the edge Drizzle client, the naive agent did reach for the right driver family (`neon-http`, stateless fetch) — but read the connection secret raw and silently picked one driver with no decision record. The connection string crosses the boundary on a non-null assertion, so a missing or malformed URL fails opaquely at runtime instead of at boot:

```ts
// src/db/index.ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const sql = neon(process.env.DATABASE_URL!); // raw env read, no Zod parse
export const db = drizzle(sql, { schema });
```

**Failure class (confirmed).** Generated edge DB wiring crosses the env boundary unvalidated — `process.env.DATABASE_URL!` instead of a Zod-parsed server-env module — which violates Rule 8 and degrades Rule 9 (no `server-only` guard keeps the connection string out of the client graph). It also hardcodes a single driver without recording the Neon-vs-Turso/libSQL call in `DECISIONS.md` and never surfaces the HTTP driver's no-interactive-transaction limit, so the riskiest constraints are picked silently rather than deliberately.

## Examples

**Input:** "Connect Drizzle to our Neon database for the edge app."
**Output:** `@neondatabase/serverless` installed; `src/db/index.ts` exports
`drizzle(neon(env.DATABASE_URL), { schema })` from `drizzle-orm/neon-http`; `DATABASE_URL`
added to the Zod server-env schema (no `NEXT_PUBLIC_`); `drizzle.config.ts` with
`dialect: "postgresql"`; a note in `DECISIONS.md` recording Neon HTTP over the WS pool.

**Input:** "Use Turso for this project."
**Output:** `@libsql/client` + `drizzle-orm/libsql`; `createClient({ url: env.DATABASE_URL,
authToken: env.DATABASE_AUTH_TOKEN })`; both vars Zod-validated server-side; config
`dialect: "sqlite"`, `driver: "turso"`; `DECISIONS.md` records the SQLite dialect choice and
its column-type implications for schema-design.

**Input:** "Queries work locally but the deployed route 500s with a `net` error."
**Output:** diagnosis — a TCP-pool driver wired into an edge route; swap to the HTTP driver
per `references/driver-setup.md`, confirm `runtime = "edge"`, redeploy a preview, verify.

## Edge Cases

- When the feature genuinely needs interactive multi-statement transactions → keep that path
  on a Node runtime route (`runtime = "nodejs"`) with a node driver, and record the split in
  `DECISIONS.md`; do not force it onto the HTTP client.
- When Neon gives a pooled (`-pooler`) and a direct host → use the driver's intended URL for
  the runtime client and the direct URL for `drizzle-kit` migrations; do not reuse blindly.
- When local dev points at a plain Postgres/SQLite file → still build the client through the
  serverless driver so dev and edge exercise the same code path; do not branch on env.
- When the app is incrementally migrating off `pages/` → this seam is App-Router-only; flag
  any `getServerSideProps` data path as drift per `../../CLAUDE.md`.

## References

- `references/driver-setup.md` — Neon HTTP and Turso/libSQL client construction, Zod server-env,
  `drizzle.config.ts` per dialect, and the migration-connection split.
- `references/edge-pitfalls.md` — the edge-incompatibility checklist: banned TCP drivers,
  transaction limits over HTTP, pooled-vs-direct URLs, `runtime` declaration, secret hygiene.

## Scripts

Reserved; empty for now. A `verify-driver.mjs` that greps the dependency tree and the `db`
module for banned TCP drivers (`pg`, `postgres`, `mysql2`, Neon WS `Pool`) would earn its
place once this fails often enough to mechanize — until then `rule-audit` covers the wiring.
