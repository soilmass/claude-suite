Purpose: the tiered prior-art search order and the concrete grep recipes for each tier, plus the index of which sibling skill owns which recurring pattern.

# The four tiers (search in this order — cheapest, closest first)

1. **In-repo** — does this codebase already do it? (Highest reinvention risk; search first.)
2. **Stack primitives** — does a Web-standard API or an installed primitive already do it?
   (See `stack-primitives.md`.)
3. **Sibling skills** — is the pattern already a procedure in this suite? (Index below.)
4. **Community** — npm / docs, captured as *candidates only* for `tech-evaluation`.

Stop at the first tier that yields an exact or extendable match. Only descend to community
when tiers 1–3 are genuinely empty.

---

# Tier 1 — in-repo grep recipes

Run from the repo root. `rg` (ripgrep) preferred; `git grep` works too. Search by capability,
not by guessed filename. Cast a wide net, then narrow.

## Existing tables / columns (Drizzle schema)
```
rg -n "pgTable|sqliteTable" src/db/schema/          # all tables
rg -ni "<entity>|<column-noun>" src/db/schema/       # e.g. "invoice", "amount", "deleted_at"
```
A column you were about to add (a `status`, a `deleted_at`, a money field) may already exist.

## Existing tRPC procedures
```
rg -n "publicProcedure|protectedProcedure" src/server/   # all procedures
rg -ni "<verb><Entity>|<entity>Router" src/server/        # e.g. "listInvoices", "invoiceRouter"
```
Reuse or extend a procedure rather than adding a parallel one. Note whether it already does
the ownership check (Rule 2) before reusing.

## Existing helpers / utils / business logic
```
rg -n "export (function|const)" src/lib/ src/utils/ src/server/   # exported surface
rg -ni "<capability noun>" src/lib/ src/utils/                    # e.g. "currency", "slug", "cursor"
```
The most-duplicated layer. Money formatting, date formatting, slugify, cursor encode/decode,
ID generation — check here before writing any of them.

## Existing components
```
rg -n "export (default )?function" src/components/        # component surface
rg -ni "<ui noun>" src/components/                         # e.g. "Dialog", "Combobox", "EmptyState"
```
Also check whether a shadcn primitive is already vendored under `src/components/ui/` before
adding any interaction component (the spine mandates composing these).

## Existing Zod schemas (Rule 8 — one shared schema per entity-operation)
```
rg -n "z\.object|z\.infer" src/                          # all schemas
rg -ni "<entity>(Input|Schema)" src/                      # e.g. "createInvoiceInput"
```
If a schema exists, share it — never author a second drifting copy.

---

# Tier 3 — sibling-skill ownership index

If the capability is one of these recurring patterns, the prior art is the skill itself —
build through it rather than from scratch:

| Capability / need                         | Owning sibling skill          |
| ----------------------------------------- | ----------------------------- |
| Cursor / keyset pagination                | `pagination-cursor`           |
| Optimistic UI mutation                    | `optimistic-updates`          |
| Money as minor units (Rule 5)             | `money-modeling`              |
| UUIDv7 public IDs                         | `uuidv7-ids`                  |
| Soft delete (`deleted_at`)                | `soft-delete-pattern`         |
| Per-tenant row scoping (Rule 2)           | `multitenancy-scoping`        |
| Drizzle relational reads, no N+1 (Rule 7) | `drizzle-relational-queries`  |
| tRPC middleware (auth/logging)            | `trpc-middleware`             |
| Composing tRPC routers                    | `trpc-router-compose`         |
| shadcn/Radix interaction composition      | `shadcn-compose`              |
| Tailwind v4 token-driven styling (Rule 3) | `tailwind-v4-component-style` |
| RHF + shared Zod form                     | `rhf-advanced`                |
| Audit logging                             | `audit-log-pattern`           |
| Temporal/timestamptz handling (Rule 6)    | `temporal-data`              |
| Env validation (Rule 8)                   | `env-validation`              |
| Caching / data fetching                   | `data-fetching-cache`         |
| Feature flags                             | `feature-flags`               |

A full new feature that combines several of these → `vertical-slice` (it orchestrates them).

---

# Tier 4 — community survey discipline

Only after tiers 1–3 are empty. Capture *candidates*, not a verdict:
- Search npm and the framework's own docs (Next.js, Drizzle, Clerk, Zod, shadcn).
- For each candidate note: name, one-line fit, apparent **edge compatibility** (this stack
  runs at the edge — a `node:*`/native-addon/persistent-socket library is likely DOA), rough
  maturity (last release, stars as a weak signal only).
- Do NOT score, rank-for-adoption, or decide here. Hand the shortlist to `tech-evaluation`,
  which owns the five-gate verdict (edge / bundle / types / maintenance / license).
