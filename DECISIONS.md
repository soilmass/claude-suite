# DECISIONS.md — Decision Records

Each entry records a resolved fork: a place where `CLAUDE.md` states an abstract
default and this project made it concrete, or where a skill resolved a choice the
project had not yet decided. Append-only. Newest at top. Date + one-line rationale,
minimum. Skills MUST record here rather than choosing silently.

Format:
```
## YYYY-MM-DD — <short title>
**Decision:** <what was decided>
**Context:** <the fork / what prompted it>
**Rationale:** <why this over the alternative>
**Consequences:** <what this now constrains downstream>
**Decided by:** <human | skill-name + human sign-off>
```

---

## 2026-06-26 — Edge runtime as the deployment target
**Decision:** The application targets the Vercel **Edge runtime**.
**Context:** The genesis fork named in the capability map ("is this edge-deployed — the
one fact that flips Prisma→Drizzle"). Resolved at project start.
**Rationale:** Latency and global distribution requirements; edge cold-start profile.
**Consequences:** Flips the ORM to Drizzle (next entry), forces the edge-compatible
Clerk middleware, and forces a serverless/HTTP DB driver (no long-lived TCP pool).
Node-only APIs are unavailable in edge route handlers and middleware — code accordingly.
**Decided by:** human

## 2026-06-26 — Drizzle ORM instead of Prisma
**Decision:** Data layer is **Drizzle ORM** + `drizzle-kit`, not Prisma.
**Context:** Direct consequence of the edge decision above. The capability-map document
was written around Prisma; this project diverges.
**Rationale:** Prisma's edge support is proxy/driver-adapter dependent and ships a
runtime query engine; Drizzle compiles to plain SQL with no engine, running natively at
the edge. Drizzle's inferred types serve equally well as the root of the type chain.
**Consequences:** Schema authored as TypeScript in `src/db/schema/`; migrations via
`drizzle-kit generate` then reviewed; the type chain roots at `InferSelectModel` /
`InferInsertModel`. The `schema-design` and `migration-author` skills are retargeted to
Drizzle idioms. Expand-contract migration discipline is unchanged in principle.
**Decided by:** human

## 2026-06-26 — Serverless/HTTP database driver
**Decision:** Use an edge-compatible serverless DB driver (Neon serverless or
Turso/libSQL class), selected at genesis.
**Context:** Edge runtime cannot hold a long-lived TCP connection pool.
**Rationale:** HTTP/serverless drivers are built for the per-request connection model
the edge imposes.
**Consequences:** Connection setup differs from a Node `pg` pool; `t3-genesis` wires the
chosen driver. Final driver pick to be confirmed when the database host is chosen — until
then, `schema-design` stays driver-agnostic (it only writes Drizzle schema, which is
portable across Postgres-compatible drivers).
**Decided by:** human (driver host: PENDING — confirm at genesis)
