Purpose: the ordered, do-this-now runbook for unwinding a bad edge deploy — code rollback mechanics, the code-vs-schema decision, and how to apply a reversal without corrupting the migrations journal.

# Rollback procedure

Rollback has two independently-moving parts. Conflating them is the whole failure class.

| Part  | Speed                | Reversible?                          | Mechanism                                  |
|-------|----------------------|--------------------------------------|--------------------------------------------|
| Code  | seconds              | yes — pointer flips back and forth   | promote prior build (no rebuild)           |
| Schema| minutes–hours        | only if the `down` is lossless       | apply authored `down`, or restore-from-backup |

Default posture: **roll code back first** (cheap, reversible), then decide if schema needs to
move at all. Most regressions are code over an additive schema and stop at step 2.

## 0. Triage (before touching anything)

- What is the symptom — 500s, wrong data, corruption, perf cliff?
- Is user data being corrupted *right now*? If yes, consider cutting traffic (maintenance
  response / disable the route) before rollback so you stop the damage while you work.
- Map the bad deploy to its migration step using `migration-deploy-coordination`'s recorded
  sequence: was this release an **expand**, a **dual-write/switch code step**, or a **contract**?
  This single classification decides whether steps 3–6 are even needed. See `contract-safety.md`.

## 1–2. Code rollback (pointer-based promotion)

On Vercel, promotion is pointer-based — the prior production build artifact still exists, so
rolling back reuses the exact bytes that worked. No rebuild, no drift.

```bash
# Inspect recent production deployments, newest first
vercel ls --prod

# Instant rollback to the immediately-previous production deployment
vercel rollback

# Or promote a specific known-good deployment by URL
vercel promote <deployment-url>
```

This is itself reversible (you can promote forward again), so it is the safe first move while
you assess schema. Do NOT rebuild from a branch under pressure — that introduces new, unvetted
bytes into an incident.

If the bad deploy is **mid-rollout** (not at 100%), halt the rollout first; a half-rolled deploy
means old and new code both serve, so re-confirm the live schema state before any reversal.

## 3. Decide: does schema need to move?

- **Bad deploy was an expand (additive: nullable column, new table, new index)** → the new
  object is harmless to the old code. Code rollback alone is complete. **Stop here.** Leave the
  column; reversing it adds risk for nothing.
- **Bad deploy was a contract (drop / rename's drop / narrow / NOT NULL / drop index)** → the
  prior build depends on the old shape. Promoting old code now would `SELECT` a dropped column
  and 500. The schema must be reversed *before* the old code is healthy — go to `contract-safety.md`
  step 4 to prove the reversal is safe, then return here for ordering.

## 4–5. Applying a reversal (only after proving it lossless in contract-safety.md)

drizzle-kit has **no native `down`/rollback runner** — `drizzle-kit migrate` only rolls forward
and `drizzle-kit generate` only authors. The reversible `down` SQL authored by `migration-author`
must be applied explicitly, as a gated admin/CI step. Never from a route handler or middleware:
on the edge runtime the Neon/Turso HTTP driver is for request-path queries, not DDL under load.

Reversal, in order:

1. Apply the authored `down` SQL against the database via the admin connection (CI job / one-off
   script using the server driver, not an edge route).
2. **Remove the reversed migration's entry from the drizzle journal** (`__drizzle_migrations`
   table and the `meta/_journal.json`) so the migrations state matches the now-reverted schema.
   If you skip this, the next `drizzle-kit generate`/`migrate` mis-detects state and may try to
   re-apply or diff against a schema that no longer exists.
3. Promote the prior code build (if not already) — schema-first, then code, the mirror of the
   forward expand-then-deploy order.

If the migration has no `down` at all, you cannot reverse it cleanly: treat it as the
irreversible path in `contract-safety.md` and file a defect against `migration-author`.

## 7. Verify recovery

- Error rate and the specific broken flow are healthy on the restored state.
- `drizzle-kit check` / a schema diff shows the live schema matches the migrations journal.
- Record in `DECISIONS.md` / incident log: what was rolled back, whether the contract boundary
  was crossed, any data loss, and what the re-attempt must do differently (e.g. backfill before
  re-adding the NOT NULL).
