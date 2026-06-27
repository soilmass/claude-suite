Purpose: when atomicity is impossible — naming the consistency boundary, designing for fewer cross-row invariants, and the saga + compensating-action pattern with idempotent steps.

# Consistency boundaries and sagas

A single statement or a `db.batch` (see `atomic-write-patterns.md`) keeps writes atomic *inside
one database round trip*. The moment an operation touches a second system — a payment provider,
an email service, a search index, another database — no transaction can span it. The honest move
is not to pretend; it is to **name the boundary** and design for eventual consistency outside it.

---

## 1. Name the consistency boundary (do this first)

For every multi-effect operation, write down — in `DECISIONS.md` — exactly:

- **What is atomic together** (one statement / one CTE / one batch). Example: *debit + credit +
  ledger row commit as one unit.*
- **What is eventually consistent**, and how it reconciles. Example: *the notification email and
  the search-index update are best-effort, retried out-of-band; they may lag the transfer.*
- **What the user is told** at each point (don't claim "done" before the atomic unit commits).

An unnamed boundary is a silently-eventual one: someone later assumes the email is transactional,
or that the index is never stale, and builds a bug on the assumption. The boundary is a design
artifact, not an implementation detail.

---

## 2. Design for fewer cross-row invariants

The cheapest transaction is the one you removed the need for. Before reaching for a CTE or a
saga, ask whether the invariant can be designed away:

- **Append-only ledger + derived balance.** Instead of a mutable `balance` that two rows must
  update together, record immutable `+`/`-` entries and derive the balance as their sum (or a
  maintained aggregate). A transfer becomes inserts, not a coordinated read-modify-write. Pairs
  with `audit-log-pattern` (the ledger is also the audit trail).
- **Single aggregate row.** Move an invariant that spans many rows onto one row the database can
  guard with a `CHECK`/uniqueness constraint, so it is enforced on a single write.
- **Idempotent upsert over read-then-write.** `INSERT … ON CONFLICT DO UPDATE` removes the
  check-then-act race without a transaction.

Fewer rows that must move together = more operations that fit in one atomic statement = fewer
sagas to operate.

---

## 3. The saga + compensating-action pattern

When an operation genuinely spans systems, run it as a **saga**: a sequence of steps, each with
a **compensating action** that undoes it. Execute forward; on failure at step *N*, run the
compensations for steps *N-1 … 1* in reverse. There is no global rollback — you *compensate*.

```
forward:      reserveStock → chargeCard → markPaid → enqueueShip
compensate:   releaseStock ← refundCard ← markUnpaid ← (cancelShip)
```

### Two requirements that make a saga correct

1. **Persisted saga state.** A row records the saga and its status
   (`pending` / `step_k_done` / `compensating` / `done` / `failed`) with a `timestamptz` per
   step (Rule 6). An edge invocation can die mid-saga; the persisted state is what lets a retry
   or a sweeper resume or compensate instead of leaving a silent partial.

2. **Idempotent steps and compensations.** Every forward action and every compensation must be
   safe to run more than once — a retry, a duplicate webhook, or a resumed saga must not charge
   twice or release stock twice. This is exactly what `idempotency-keys` provides: each step
   carries a stable key; the provider/handler dedupes on it. **A saga on non-idempotent steps is
   a double-spend waiting for a retry.**

```ts
// Sketch — each step keyed and recorded; compensation runs in reverse on failure.
const saga = await beginSaga({ kind: "checkout", state: "pending" }); // persisted row
try {
  await reserveStock({ key: `${saga.id}:reserve`, ... });   await advance(saga, "reserved");
  await chargeCard({ key: `${saga.id}:charge`, ... });      await advance(saga, "charged");
  await markPaid({ key: `${saga.id}:paid`, ... });          await advance(saga, "done");
} catch (err) {
  await markCompensating(saga);
  // reverse order; each compensation idempotent and keyed
  if (reached(saga, "charged"))  await refundCard({ key: `${saga.id}:refund`, ... });
  if (reached(saga, "reserved")) await releaseStock({ key: `${saga.id}:release`, ... });
  await markFailed(saga);
  throw err;
}
```

### Operating a saga

- **Compensations can fail too.** Make them retryable, cap the retries, and surface a stuck
  saga (`failed`) to an operator. Never swallow a failed compensation — that is the boundary
  leaking inconsistency invisibly.
- **A sweeper** (cron / queue) re-drives `pending`/`compensating` sagas that an edge invocation
  abandoned, using the persisted state and the idempotency keys to avoid re-applying completed
  steps.

---

## 4. The Node-route escape hatch

If an operation truly needs an interactive, multi-statement, read-branch-write transaction that
cannot collapse into a CTE and is not a fit for a saga, isolate that one path on a Node runtime
route (`export const runtime = "nodejs"`) with a Node Postgres driver and a real
`db.transaction(...)`. Record the split in `DECISIONS.md` — it is a deliberate deviation from
the edge default in `../../CLAUDE.md`, not a silent fallback, and it carries the Node cold-start
and connection-pooling costs the edge target was chosen to avoid.
