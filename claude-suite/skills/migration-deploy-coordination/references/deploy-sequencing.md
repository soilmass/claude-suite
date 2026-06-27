Purpose: the mechanics of ordering an expand-contract change across separate deploys — DDL safety classification, the canonical sequences, the per-step compatibility matrix, migration-apply gating, and the dual-write window.

# Deploy sequencing

## The one fact that drives everything

An edge rollout is **not** atomic. Across regions, and during the seconds-to-minutes a deploy
takes to propagate, the **previous code version keeps serving requests** while the new version
comes up. There is a window — sometimes a long one — when two code versions hit **one** live
schema. Every intermediate schema state must be compatible with **both** versions. That single
constraint is the entire reason for expand-contract and for separate deploys.

Migrations run as a dedicated CI/CD step (`drizzle-kit migrate`) against the serverless HTTP
driver — **never** at request time in an edge function. So a migration's apply time is a thing
you schedule relative to a deploy, not a thing that happens lazily.

## DDL safety classification

| Change | Safe additive? | Why / what to do |
|---|---|---|
| Add nullable column | Yes | Old code ignores it. Ship before its consumer, any order. |
| Add table | Yes | Nothing references it yet. |
| Add index (small table) | Yes | Non-blocking enough to ship anytime. |
| Add index (large/populated) | Needs care | `CREATE INDEX CONCURRENTLY` — see caveat below. |
| Add nullable FK | Yes | Old code oblivious; enforce later if needed. |
| Add column with non-null default | Risky | On large tables a default rewrite can lock; prefer add-nullable → backfill → set default/NOT NULL. |
| Drop column | **Breaking** | Old code may still `SELECT`/`INSERT` it. Contract step only, after old code drains. |
| Rename column | **Breaking** | = drop + add. Never in place. Full sequence with dual-write. |
| Change/narrow type | **Breaking** | Add new-typed column, backfill, switch, drop old. |
| Add NOT NULL | **Breaking** | Existing NULLs and old inserts violate it. Backfill → stop NULL writes → add+validate. |
| Add UNIQUE on existing data | **Breaking** | May fail on dupes; old code may insert a collision mid-rollout. Dedupe → enforce. |
| Remove/rename enum value | **Breaking** | Old code may still emit it. Full sequence. |
| Add enum value | Yes | Old code ignores the new value. |

## Canonical sequences

### Rename `name` → `title` (four releases)

```
R1  EXPAND        migration: ADD COLUMN title (nullable). Old code untouched (still uses name).
    BACKFILL      job copies name → title in chunks (data-backfill). Not in the migration.
R2  DUAL          deploy: code writes BOTH name and title; reads title ?? name.
R3  SWITCH        deploy: code writes/reads title only. Confirm 100% rollout. name now unused.
R4  CONTRACT      migration: DROP COLUMN name. <-- irreversibility boundary.
```

At every row, both the draining old version and the incoming new version work:
- R1: old reads `name` (present); new not deployed. OK.
- R2: old reads `name` (still written); new reads `title` (backfilled + dual-written). OK.
- R3: old (draining) reads `name` — **must still exist**, so the column is not dropped until R4.
- R4: only R3 code is live; it never touches `name`. Safe to drop.

### Add `NOT NULL` to an existing column (three releases)

```
R1  BACKFILL   set every existing NULL to a valid value (data-backfill).
R2  DEPLOY     code stops writing NULL; fully rolled out.
R3  CONSTRAINT migration: ALTER COLUMN ... SET NOT NULL (validate). Treat as a contract.
```

Adding the constraint while NULLs exist, or while old NULL-inserting code still runs, fails
the constraint *during* rollout. The matrix catches it.

### Type change `int` → `bigint` / `text` → `enum` (four releases)

Same shape as rename: add new-typed column → backfill → dual-write/read-new → drop old.

## Per-step compatibility matrix (fill this in for every plan)

For each release, name the schema state and the two code versions live at once, then assert
"both OK":

```
Release | Schema state              | Old version does        | New version does        | Both OK?
--------|---------------------------|-------------------------|-------------------------|---------
R1      | name + title(nullable)    | r/w name                | (not deployed)          | yes
R2      | name + title              | r/w name                | w name+title, r title   | yes
R3      | name + title             | r/w name (draining)     | r/w title only          | yes (name still exists)
R4      | title only                | (gone)                  | r/w title only          | yes
```

If any cell is "no," insert a release between the offending rows. A breaking change is just a
chain long enough that every row is "yes."

## Migration-apply gating

- **Expand migration applies BEFORE the deploy that consumes it.** Sequence:
  `drizzle-kit migrate` (adds the column) → confirm applied → deploy the code. If the code
  ships first, it queries a column that does not exist and 500s.
- **Contract migration applies AFTER the prior deploy is 100% live.** Sequence: deploy the
  switch code → confirm full rollout (see `rollback-windows.md`) → `drizzle-kit migrate`
  (drops the column). If the drop applies while old code drains, old code 500s.
- Wire these as ordered pipeline stages with a gate between migrate and deploy; never let a
  deploy race its migration in parallel jobs.

## `CREATE INDEX CONCURRENTLY` caveat

`CREATE INDEX CONCURRENTLY` does not lock the table for writes, but it **cannot run inside a
transaction** — and drizzle-kit wraps each migration in one. Put a concurrent index in its
own migration file marked non-transactional (drizzle-kit supports a `--no-transaction` / a
`-- breakpoint`-free standalone statement; confirm the current flag with `perishable-refresh`).
Otherwise either the build fails ("CREATE INDEX CONCURRENTLY cannot run inside a transaction
block") or you fall back to a plain `CREATE INDEX` that locks writes for the duration.

## Dual-write / dual-read window

Between expand and contract the new code:
- **writes both** columns on every insert/update, so a rollback to old code still finds `name`
  populated and the new column stays current;
- **reads the new** column with a fallback to the old (`title ?? name`) while the backfill is
  still completing, then drops the fallback once the backfill is verified 100%.

Turn off the old-column write only in the release immediately before the contract, and only
after confirming the new column is fully populated.
