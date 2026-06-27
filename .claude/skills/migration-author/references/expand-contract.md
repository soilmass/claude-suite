# Expand-contract with drizzle-kit (exact commands)

A destructive change (rename, drop, type narrow, NOT NULL on populated) is staged across
separate deploys so running code never sees a shape it doesn't expect. Each stage is its
own migration with a working `down`.

Worked example: rename `users.full_name` → `users.display_name`, prod data present.

## Stage 1 — EXPAND (deploy A)
Add the new column, nullable. Old code untouched and working.

Edit schema:
```ts
// add to users table
displayName: varchar("display_name", { length: 200 }),  // nullable for now
```
Generate + review + apply:
```
npx drizzle-kit generate   # READ the SQL before applying
npx drizzle-kit migrate
```
- **up:** `ALTER TABLE users ADD COLUMN display_name varchar(200);`
- **down:** `ALTER TABLE users DROP COLUMN display_name;`

## Stage 2 — BACKFILL (data migration)
Copy old → new. Reversible because old column still exists.
```sql
UPDATE users SET display_name = full_name WHERE display_name IS NULL;
```
- **down:** no-op (new column dropped in stage 1's down if rolled all the way back).

## Stage 3 — SWITCH (deploy B) — handed to `refactor`
Deploy code that reads/writes `display_name`. Optionally make it NOT NULL now that it's
populated:
```
npx drizzle-kit generate && npx drizzle-kit migrate
```
- **up:** `ALTER TABLE users ALTER COLUMN display_name SET NOT NULL;`
- **down:** `ALTER TABLE users ALTER COLUMN display_name DROP NOT NULL;`

## Stage 4 — CONTRACT (deploy C, later)
Only once NO running code references `full_name`, drop it.
```
npx drizzle-kit generate && npx drizzle-kit migrate
```
- **up:** `ALTER TABLE users DROP COLUMN full_name;`
- **down:** `ALTER TABLE users ADD COLUMN full_name varchar(200);` + re-backfill from
  display_name (note: original data beyond what was copied is not recoverable — state this).

## Why not one step
`ALTER TABLE users RENAME COLUMN full_name TO display_name;` in a single deploy breaks
every running instance still selecting `full_name` during the rollout window, and the
`down` can't restore rows written under the new name to the old one cleanly. Expand-contract
keeps every intermediate state readable by both old and new code.

## Non-destructive changes
Adding a nullable column or a new table is not destructive — a single migration is fine,
but the `down` is still required.
