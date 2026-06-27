Purpose: the toolkit for staying atomic over an HTTP database driver — single guarded statements, data-modifying CTEs, and `db.batch([...])` — and the zero-row-update trap that makes `batch` unsafe for a conditional invariant.

# Atomic write patterns over HTTP

The edge HTTP driver (`drizzle-orm/neon-http`, remote `libsql`) runs each query as one
stateless `fetch`. There is no session to hold `BEGIN…COMMIT` across awaits, so the only units
that are atomic are: (1) a single SQL statement, (2) a data-modifying CTE (still one
statement), and (3) `db.batch([...])` (one round trip, rolled back together on error). Interactive
`db.transaction(async (tx) => …)` is unavailable — it throws on `neon-http`. The constraint
itself lives in `neon-turso-driver`; this file is *what to write instead*.

---

## 1. A single guarded statement (the cheapest atomicity)

One statement is atomic by definition. Push the invariant into the `WHERE`, scope ownership
(Rule 2), and read what happened from `RETURNING` / `rowsAffected`.

```ts
// Decrement stock only if it stays >= 0, only on the owner's row. One atomic statement.
const updated = await db
  .update(items)
  .set({ stock: sql`${items.stock} - ${qty}` })
  .where(and(eq(items.id, id), eq(items.ownerId, ctx.auth.userId), gte(items.stock, qty)))
  .returning({ id: items.id });

if (updated.length === 0) {
  throw new TRPCError({ code: "CONFLICT", message: "Insufficient stock." });
}
```

The `gte(...)` guard is the invariant; a zero-length `returning` means the guard failed — map
it to a typed error. No transaction needed, because nothing partial can happen inside one
statement.

`INSERT … ON CONFLICT … DO UPDATE` (upsert) is the same idea for "create-or-update": atomic,
no read-then-write race.

---

## 2. The data-modifying CTE (atomic multi-row / multi-table)

Postgres lets a single statement contain several writes in `WITH` clauses, where each later
write is **conditional on** an earlier one via `RETURNING` + `EXISTS`. The whole statement
commits or rolls back as one unit. This is the correct guarded-transfer shape over HTTP.

```ts
import { z } from "zod";

// Airtight guarded transfer: the debit fires ONLY if the recipient exists, the sender owns the
// row, and the funds are there; the credit and ledger fire ONLY if the debit matched. A missing
// recipient OR insufficient funds commits NOTHING — it is one statement, so there is no partial.
const result = await db.execute(sql`
  WITH recipient AS (
    SELECT id FROM accounts WHERE id = ${toId}
  ),
  debit AS (
    UPDATE accounts
       SET balance_minor = balance_minor - ${amountMinor},
           updated_at    = now()
     WHERE id = ${fromId}
       AND owner_id = ${ctx.auth.userId}
       AND balance_minor >= ${amountMinor}
       AND EXISTS (SELECT 1 FROM recipient)
    RETURNING id
  ),
  credit AS (
    UPDATE accounts
       SET balance_minor = balance_minor + ${amountMinor},
           updated_at    = now()
     WHERE id = ${toId}
       AND EXISTS (SELECT 1 FROM debit)
    RETURNING id
  ),
  ledger AS (
    INSERT INTO transfers (from_id, to_id, amount_minor, currency, created_at)
    SELECT ${fromId}, ${toId}, ${amountMinor}, ${currency}, now()
    WHERE EXISTS (SELECT 1 FROM debit)
    RETURNING id
  )
  SELECT
    (SELECT count(*) FROM recipient) AS recipient_exists,
    (SELECT count(*) FROM debit)     AS debited
`);

// Rule 8 / Rule 1: the raw-SQL result is a boundary. Parse it; never assert the shape with a generic.
const Result = z.object({ recipient_exists: z.coerce.number(), debited: z.coerce.number() });
const { recipient_exists, debited } = Result.parse(result.rows[0]);

if (recipient_exists === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Recipient not found." });
if (debited === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient funds." });
```

Why this is correct where the naive CTE is not: the baseline run guarded **only** the debit's
funds, so a missing recipient committed the debit and skipped the credit (credits destroyed),
then threw `NOT_FOUND` *after* the statement had already committed — a throw does not unwind a
committed write. Here the debit is itself gated on `EXISTS (SELECT 1 FROM recipient)`, so a
missing recipient leaves the debit at zero rows and the whole statement is a no-op; the credit
and ledger cascade off `EXISTS (SELECT 1 FROM debit)`. The post-statement `throw` is now safe
precisely because when `recipient_exists` or `debited` is `0`, **nothing committed** — there is
nothing to unwind. The two counts distinguish the two failure causes for a typed error.

Notes:
- `db.execute()` with a tagged `sql` template returns an untyped driver result. **Always
  Zod-parse `.rows[0]`** (Rules 8, 1). `numeric`/`bigint`/`count` come back as strings —
  `z.coerce.number()` or keep them as strings; never `parseFloat` money (see `money-modeling`).
- Drizzle's `db.$with(...)` / `.with(...)` builder covers *SELECT* CTEs; data-modifying CTEs
  (UPDATE/INSERT inside `WITH`) are clearest through the `sql` template as above.

---

## 3. `db.batch([...])` — independent writes, one round trip

`batch` ships an array of statements together and rolls them back together **if one throws**.
Use it only when the statements are independent (no statement depends on another's result).

```ts
// batch returns one result per statement, positionally; here the first is the insert's RETURNING.
const [insertedOrders] = await db.batch([
  db.insert(orders).values(o).returning({ id: orders.id }),
  db.update(inventory).set({ qty: sql`${inventory.qty} - 1` }).where(eq(inventory.id, a)),
  db.insert(orderEvents).values({ orderId: o.id, kind: "created" }),
]);
const order = insertedOrders[0];
```

### The zero-row-update trap (why `batch` ≠ conditional atomicity)

`batch` is all-or-nothing only on a **thrown error**. A guarded UPDATE that matches **zero
rows is not an error** — it succeeds with `rowsAffected = 0`. So this is broken:

```ts
// ❌ BROKEN: if the debit guard fails (insufficient funds), the debit updates 0 rows and does
// NOT throw — so the credit STILL commits. Money invented from nothing.
await db.batch([
  db.update(accounts).set({ balance: sql`balance - ${n}` })
    .where(and(eq(accounts.id, from), gte(accounts.balance, n))),
  db.update(accounts).set({ balance: sql`balance + ${n}` }).where(eq(accounts.id, to)),
]);
```

A conditional cross-row invariant ("credit only if the debit succeeded") cannot live in a
`batch`; it must live in one statement (the CTE in §2), or you must check `rowsAffected` and
run a compensation (see `saga-and-boundaries.md`). Reserve `batch` for writes that are each
unconditionally correct on their own.

---

## Decision checklist

- [ ] No interactive `db.transaction(async tx => …)` anywhere on an `edge` path.
- [ ] Every cross-row *conditional* invariant lives in ONE statement (CTE), not a `batch`.
- [ ] Ownership (`owner_id = ctx.auth.userId`) is in the write predicate (Rule 2).
- [ ] Every `db.execute()` raw-SQL result is Zod-parsed before use (Rules 8, 1); money stays
      integer minor units (Rule 5); timestamps are `now()` into `timestamptz` (Rule 6).
- [ ] `rowsAffected` / `RETURNING` is checked and mapped to a typed `TRPCError`, not ignored.
