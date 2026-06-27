Purpose: where rollback is cheap vs impossible across an expand-contract sequence — the irreversibility boundary, confirming a multi-region rollout completed before contracting, and the hand-off to rollback-runbook.

# Rollback windows

## Reversibility per step

Expand-contract is designed so that **everything up to the contract is reversible by
redeploying code alone** — the old columns still exist, so the previous code version still
works. The contract is the one step that destroys that escape hatch.

| Step | If this deploy fails / must revert | Cost |
|---|---|---|
| Expand (additive migration) | Roll back code; leave the new column (it is inert/nullable). | Cheap. The column is harmless unused. |
| Backfill job | Stop/resume the job; it is chunked and idempotent (`data-backfill`). No code revert needed. | Cheap. |
| Dual-write deploy | Roll back to pre-dual code; old column was kept current by the dual-write. | Cheap. |
| Switch-reads deploy | Roll back to dual-write code; new column still populated, old column still written. | Cheap — **this is why the old column is not dropped yet.** |
| Contract (drop/rename) | Code rollback does NOT help — the old column is gone. | **Expensive: restore from backup.** |

## The irreversibility boundary

The contract deploy (the one whose migration drops/renames/narrows the old column) is the
**point of no return**. Before it, every problem is a `vercel rollback` / redeploy away. After
it, the old shape no longer exists, so reverting to code that expected it requires a
point-in-time restore.

Mark this explicitly in the release plan and in `DECISIONS.md`:
- which release is the contract,
- what data is destroyed,
- the restore procedure if it goes wrong (a backup snapshot taken immediately before),
- the go/no-go check that must pass before it runs.

Never let a contract ship implicitly bundled with other changes — it should be its own small,
deliberate release whose only job is the drop.

## Confirm 100% rollout before contracting

"The deploy command returned" is **not** "the old version is gone." On an edge platform the
new build propagates across regions over time, and stale instances can serve briefly. Before
running a contract migration, confirm:

- The platform reports the new deployment at **100%** / fully promoted across **all** regions
  (not just the primary) — `deploy-edge` owns reading this signal.
- No traffic is still hitting the previous deployment ID (check the platform's per-deployment
  request metrics; wait until the old ID's request rate is zero).
- Any long-lived clients (open SSE/streaming connections, queued jobs holding old code) have
  cycled.

Only then is it true that no live code references the column you are about to drop. A safe
default is to leave at least one full propagation interval — and ideally an extra buffer —
between the switch deploy and the contract.

## A NOT NULL / UNIQUE constraint is a contract

Adding a constraint is on the same side of the boundary as a drop: it can fail the instant a
draining old instance inserts a violating row. Apply it only after the rollout that stopped
producing violations is confirmed 100% — and keep the validate step separate so a violation is
caught at validation, not as a request-time 500.

## Hand-off contract to `rollback-runbook`

When this skill finishes, it hands `rollback-runbook` a per-release rollback plan:

- For each pre-contract release: "revert = redeploy previous build; schema needs no change."
- The named contract release with its irreversibility boundary, the pre-contract backup
  snapshot ID, and the restore procedure.
- The go/no-go checklist that gates the contract (the 100%-rollout confirmation above).

`rollback-runbook` owns executing a recovery; this skill owns defining *where the cliff is* so
that runbook knows which side of it any given failure is on.
