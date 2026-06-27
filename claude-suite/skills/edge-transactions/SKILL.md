---
name: edge-transactions
description: >
  Achieve atomicity and consistency on the edge HTTP database driver, where multi-statement
  interactive transactions do NOT work because each query is a stateless `fetch` with no
  session to hold `BEGIN…COMMIT` across awaits. Covers the writes that ARE atomic over HTTP —
  a single guarded statement, a data-modifying CTE that chains conditional writes, and Drizzle
  `db.batch([...])` — the zero-row-update trap that makes `batch` unsafe for a conditional
  invariant, designing operations to need fewer cross-row invariants, and the saga /
  compensating-action pattern (with idempotent steps) for when atomicity is impossible. Names
  the consistency boundary explicitly instead of leaving it implicit.
  Use when: "transfer between accounts atomically", "transaction at the edge", "db.transaction
  doesn't work", "atomic multi-table write", "saga", "compensating action", "consistency boundary".
  Do NOT use for: wiring or choosing the HTTP driver itself (use neon-turso-driver); shaping
  multi-table reads or single-round-trip read queries (use drizzle-relational-queries).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the edge-atomicity failure class: reaching for interactive
    `db.transaction()` over an HTTP driver (it throws on neon-http), or assuming `db.batch()`
    covers a conditional invariant when a zero-row guarded UPDATE is not an error — leaving a
    partial-write hole that destroys or invents value. Baseline replaced with an observed
    2026-06-26 run (narrowed: the base model reaches for a CTE but leaves the hole unguarded).
---

# edge-transactions

The procedure for keeping writes atomic when the database speaks HTTP, not a held session.
The edge target (the fork-defining fact in `../../CLAUDE.md`) means every query is a separate
stateless `fetch`: there is no connection to hold a `BEGIN…COMMIT` open across awaits, so an
interactive `db.transaction(async (tx) => …)` throws on `neon-http` or silently abandons
atomicity. This skill picks the form that *does* stay atomic over HTTP — one guarded
statement, a data-modifying CTE, or `db.batch([...])` — and, when no transaction is possible,
designs the saga and names the consistency boundary out loud.

`neon-turso-driver` establishes the constraint (HTTP has no interactive transactions); this
skill is its procedure-depth follow-on. It obeys Rule 2 (ownership in the write predicate) and
Rules 8/1 (raw-SQL results are a boundary — Zod-parse them, never assert the shape).

---

## Non-Negotiable Rules

The partial write compiles, demos cleanly on the happy path, and then destroys or invents
value the first time a step fails — so these are hard lines:

- **Never call interactive `db.transaction(async (tx) => …)` over the HTTP driver.** It throws
  on `neon-http` and cannot hold atomicity over `fetch` round trips. Use one statement, a
  data-modifying CTE, or `db.batch([...])` instead.
- **Never trust `db.batch()` to enforce a *conditional* invariant.** `batch` is all-or-nothing
  only on a thrown error; a guarded UPDATE that matches zero rows is **not** an error, so the
  sibling statements still commit. Encode a conditional cross-row invariant in ONE statement
  (a CTE keyed on `RETURNING`/`EXISTS`), or check `rowsAffected` and compensate.
- **Never leave the consistency boundary implicit.** State, per operation, exactly which rows
  and systems change atomically together and which may lag, and record the call in
  `DECISIONS.md`. An unnamed boundary is a silently-eventual one.
- **Never build a saga on non-idempotent steps.** Every forward action and its compensation
  must be idempotent (idempotency-keys) or a retry double-charges, double-ships, or
  double-credits.

Refuse these rationalizations: "the transaction works in dev" (dev is Node/pooled, the edge
HTTP client is not); "batch is atomic so the guard is covered" (zero rows ≠ error); "I'll do
the two updates back-to-back, a failure between them is rare" (rare partial failure still
invents or destroys value); "the email/charge is part of the same transaction" (an external
call cannot enlist in a DB transaction — it is a saga step).

---

## When to Use

- Money/credit transfers, inventory decrements, or any write where two+ rows must move together.
- A feature reaches for `db.transaction(...)` and the runtime is `edge` over an HTTP driver.
- A multi-table write must be all-or-nothing, or a write must be conditional on another's result.
- An operation crosses out of the database (payment provider, email, another service) yet still
  needs a consistency story.

## When NOT to Use

- Choosing/wiring the Neon vs Turso HTTP driver, the stateless client, env validation →
  `neon-turso-driver` (it owns the constraint; this consumes it).
- Shaping a multi-table *read* or eliminating an N+1 read → `drizzle-relational-queries`.
- Deciding the money column type, currency, and rounding for the amounts moved → `money-modeling`.
- Recording the immutable who-did-what trail of the change → `audit-log-pattern`.
- Making a single mutation safe to retry in isolation (the dedup key itself) → `idempotency-keys`.

---

## Procedure

1. **Name the consistency boundary first (high-interrogation).** List every row and external
   system the operation touches and decide, explicitly, what is one atomic unit versus what may
   be eventually consistent. This decision drives every step below and is expensive to retrofit
   — record it in `DECISIONS.md`. See `references/saga-and-boundaries.md`.

2. **Reach for the smallest atomic unit: a single statement.** One SQL statement is atomic with
   no driver support needed. Push the invariant into SQL — a guarded
   `UPDATE … SET … WHERE <guard> RETURNING …`, `INSERT … ON CONFLICT … DO UPDATE`. Scope
   ownership in the `WHERE` (Rule 2). See `references/atomic-write-patterns.md`.

3. **For an atomic multi-row/multi-table write, use a data-modifying CTE — one statement whose
   later writes are *conditional on* the earlier ones** via `RETURNING` + `EXISTS`. This is how
   a guarded transfer (debit only if funds; credit only if the debit fired) stays atomic over
   HTTP. Run it through `db.execute()` with a tagged `sql` template and **Zod-parse the result**
   (Rules 8, 1) — never assert the row shape with a generic. See `references/atomic-write-patterns.md`.

4. **Use `db.batch([...])` only for independent writes with no cross-statement condition.**
   It ships multiple statements in one round trip, rolled back together on a thrown error. But
   a zero-row guarded UPDATE does not throw, so do not use `batch` to express "credit only if
   the debit succeeded" — that belongs in a CTE (step 3). See `references/atomic-write-patterns.md`.

5. **Reduce cross-row invariants by design.** Prefer an append-only ledger with a derived
   balance, a single aggregate row, or event-style records, so fewer rows must move together
   and most writes become a single insert. The cheapest transaction is the one you removed the
   need for. See `references/saga-and-boundaries.md`.

6. **When atomicity is genuinely impossible (an external service or a cross-boundary step), run
   a saga with compensations.** Persist saga state (`pending`/`done`/`compensating`/`failed`,
   `timestamptz` per Rule 6), make each forward step and its compensation idempotent
   (idempotency-keys), and on failure run the compensations in reverse. Accept eventual
   consistency *within the named boundary*. See `references/saga-and-boundaries.md`.

7. **Verify before done.** No interactive `db.transaction` over HTTP; the invariant holds under
   a partial failure (no zero-row sibling-commit hole); raw-SQL results are Zod-parsed and typed
   (Rules 1, 8); ownership is in the write predicate (Rule 2); and the boundary call is recorded
   in `DECISIONS.md`. Run `rule-audit` over the diff.

---

## Composes With

- **Consumes:** `neon-turso-driver` — the "no interactive transactions over HTTP" constraint
  originates there; this skill is its procedure-depth follow-on for *what to do instead*.
- **Pairs with:** `drizzle-relational-queries` — the single-round-trip discipline on the write
  side; `money-modeling` — the moved amounts are integer minor units (Rule 5), parsed at the
  boundary by the shared Zod schema.
- **Hands off:** `idempotency-keys` — saga forward steps and compensations must be idempotent;
  `audit-log-pattern` — the ledger/saga-state record of the movement.
- **Runs against:** `rule-audit` (Rules 1, 2, 7, 8 over the writes you produce).

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent told to implement as
> a typical dev would, no project conventions): "implement an edge tRPC `transferCredits` that
> atomically moves credits between two accounts using Drizzle over Neon `neon-http`." The
> imagined catastrophe (blindly reaching for `db.transaction()`) did NOT occur — a capable base
> model knows better. A **narrower** failure class was confirmed.

**Observed run.** The agent correctly noted `neon-http` has no interactive transactions and
reached for a data-modifying CTE — debit guarded by `WHERE balance >= amount`, credit gated on
`EXISTS (SELECT 1 FROM debited)`. Good instinct. But it shipped a real partial-write hole and
skipped the boundary disciplines:

```ts
const result = await db.execute<{ id: string; side: string }>(sql`…CTE…`); // shape asserted, not parsed
const rows = result.rows ?? [];                                            // untyped (Rule 1)
if (!debited) throw new TRPCError({ code: "BAD_REQUEST", … });
if (!credited) throw new TRPCError({ code: "NOT_FOUND", … });  // ← thrown AFTER the debit already committed
```

Its own caveat: *"if the recipient row is missing, the debit's CTE still evaluates, so for
strict safety I'd normally add a matching guard to the debit."* Exactly — the debit is **not**
guarded on the recipient existing, so a missing recipient commits the debit, skips the credit,
**destroying credits**, and the `NOT_FOUND` throw runs *after* the statement committed and does
not unwind it. It also asserted the result with a `db.execute<T>()` generic instead of
Zod-parsing it (Rule 8), read `process.env.DATABASE_URL!` raw (Rules 8, 9), added **no
idempotency key** and **no ledger record**, and reasoned the boundary locally but **never named
or recorded** it.

**Failure class (confirmed, narrowed).** Not "reaches for `db.transaction()` and melts" — the
base model avoids that. It is "writes a plausible CTE with an unguarded partial-failure path,
asserts the raw-SQL result instead of validating it, and ships with no idempotency, no audit
trail, and an unnamed boundary." This skill closes those: the invariant fully in one statement
(both sides guarded), the result Zod-parsed, idempotent retries, and the boundary recorded.

---

## Examples

**Input:** "Transfer N credits from the signed-in user to another account, atomically, on edge."
**Output:** One data-modifying CTE via `db.execute`: a `recipient` CTE, a `debit` UPDATE guarded
on funds + ownership + `EXISTS (SELECT 1 FROM recipient)`, then a `credit` UPDATE and ledger
`INSERT` cascading off `EXISTS (SELECT 1 FROM debit)` — so a missing recipient or insufficient
funds commits *nothing*. The result is Zod-parsed, the returned counts mapped to a typed
`TRPCError`, and the boundary ("debit+credit+ledger atomic, notification eventual") recorded in
`DECISIONS.md`.

**Input:** "Create an order and decrement three independent inventory rows together."
**Output:** `db.batch([db.insert(orders)…, db.update(inv).where(eq(inv.id,a))…, …])` — independent
writes, no cross-statement condition, all-or-nothing on error in one round trip. If any
decrement must *not* go negative, that guard moves into a CTE per item (or a checked
`rowsAffected`), because a zero-row update would not roll the batch back.

**Input:** "Charge the card, then mark the subscription active." (DB + external provider)
**Output:** A saga, not a transaction: persist `saga_state(pending)`; charge with an idempotency
key; on success flip to active (idempotent upsert); on failure after charge, run the refund
compensation (also keyed). The boundary — "charge and activation are eventually consistent,
reconciled by saga state" — is named in `DECISIONS.md`.

---

## Edge Cases

- **A true interactive read-modify-write that can't collapse to one statement or a saga** → put
  that one path on a Node route (`runtime = "nodejs"`) with a Node driver and a real transaction,
  and record the split in `DECISIONS.md`; do not force it onto the HTTP client.
- **The conditional invariant spans more rows than a CTE expresses cleanly** → move it onto a
  single aggregate row (or a uniqueness/`CHECK` constraint) the database enforces on one write,
  rather than coordinating many in app code.
- **A `batch` mixes a guarded conditional write with unconditional ones** → split it: the
  conditional part becomes a CTE whose `rowsAffected` you check; only independent writes stay in `batch`.
- **A saga compensation can itself fail** → make compensations retryable and idempotent, cap
  retries, and surface a stuck `failed` saga to an operator — never silently swallow it.

---

## References

- `references/atomic-write-patterns.md` — the over-HTTP atomic toolkit: single guarded
  statements, data-modifying CTEs (the guarded-transfer pattern) via `db.execute` + Zod parsing,
  `db.batch([...])` semantics, and the zero-row-update trap that makes `batch` unsafe for
  conditional invariants.
- `references/saga-and-boundaries.md` — naming the consistency boundary, designing for fewer
  cross-row invariants (append-only ledger / derived balance / aggregate rows), the saga +
  compensating-action pattern with idempotent persisted steps, and the Node-route escape hatch.

## Scripts

`scripts/` is reserved (`.gitkeep`). A signal that would justify one: a static check flagging
`db.transaction(` on a file that declares `runtime = "edge"` — but that overlaps
`neon-turso-driver`/`rule-audit`, so this likely stays script-free until the overlap is felt.
