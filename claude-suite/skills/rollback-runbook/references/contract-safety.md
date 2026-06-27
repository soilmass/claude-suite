Purpose: prove whether a schema reversal is safe before running it — classify the reversed step, read the `down` for data loss, locate the irreversibility boundary, and take the restore-from-backup path when reversal would lose data.

# Contract-step safety: is this reversal lossless?

The dangerous moment in a rollback is reversing a **contract** step. A contract dropped,
renamed, or narrowed something; its `down` re-creates the *shape* but cannot, by itself, recreate
the *data* that was in it. "Run the down" is not automatically safe.

## Classify the reversed step

| Forward step you are reversing            | Type     | Reversal safety                                  |
|-------------------------------------------|----------|--------------------------------------------------|
| Add nullable column / new table / index   | expand   | usually no reversal needed (harmless); if you do, dropping the new column is lossless |
| Backfill (data copy old→new)              | data     | reversing rarely needed; the source still exists |
| Dual-write / read-switch (code only)      | code     | code rollback only; no schema move               |
| Drop column / drop table                  | contract | **lossy** — `down` re-adds an empty column; rows are gone |
| Rename column (final drop of old name)    | contract | **lossy** if old name's data wasn't dual-written; lossless only if data still exists under new name |
| Narrow type / add NOT NULL / add CHECK    | contract | dropping the constraint is **lossless**; a type narrowing that truncated values is lossy |
| Drop index / drop FK                      | contract | recreating it is lossless (rebuilds from data)   |

The rule of thumb: a contract that **removed data** is lossy to reverse; a contract that only
**removed a structure computed from data** (index, FK, constraint) is lossless to reverse.

## Read the `down` before running it

Open the migration's authored `down` SQL (`migration-author` requires every migration carry
one). Ask of each statement:

1. Does it `ADD COLUMN` / `CREATE TABLE` that the forward step `DROP`ped? → the re-added object
   is **empty**. Any rows that lived there are not coming back from the `down`. **Lossy.**
2. Does it only `DROP CONSTRAINT` / `CREATE INDEX` / `ADD CONSTRAINT ... FOREIGN KEY`? → it
   rebuilds from existing data. **Lossless** — safe to apply.
3. Does it `ALTER TYPE` to a wider type? → lossless. To a narrower type? → may truncate. **Lossy.**

If there is **no `down`**, you cannot reverse cleanly — treat as the irreversible path below.

## The irreversibility boundary

`migration-deploy-coordination` marks one release in every breaking sequence as the
**irreversibility boundary** — the contract deploy past which rolling back code alone is
impossible because the old column/table is gone. Your job in rollback is to find which side of
that boundary the bad deploy is on:

- **Before the boundary** (you only shipped expand and/or dual-write code): roll back code; the
  old shape still exists; nothing is lost. This is the common, easy case.
- **At/after the boundary** (the contract already applied and dropped data): a `down` that
  re-adds the column gives you an empty column, not your data. **Do not run it as a "rollback."**

## When reversal is lossy: restore-from-backup

Past the boundary, "rollback" means a database point-in-time restore coordinated with the code
rollback — not a fabricated-empty-column `down`.

1. Identify the restore target: the last point-in-time *before* the contract applied (Neon
   branch/restore or Turso/libSQL backup, depending on the driver in `DECISIONS.md`).
2. Restore to that point (or to a new branch, then cut over) — this brings back both the shape
   **and** the data.
3. Promote the matching prior code build so code and schema agree again.
4. Accept and record the data delta: writes that happened between the restore point and now are
   lost unless separately replayed. This is why crossing the boundary is an incident, not a
   routine rollback.

Record in the incident log / `DECISIONS.md`: the boundary was crossed, the restore point chosen,
the data window lost, and what the re-attempt must change so it does not have to cross the
boundary blind again (e.g. keep the old column one more release).
