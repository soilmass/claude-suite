Purpose: enforce append-only — in-transaction writes, revoked grants, diff-from-pre-image, redaction, and optional hash-chaining.

# Immutability and write discipline

## 1. Write in the same transaction as the change

The audit entry and the change it records commit together or roll back together. A
fire-and-forget write after the commit drops records exactly when something failed — the case
you most need recorded.

```ts
// src/server/orders/changeStatus.ts — plain function the tRPC procedure calls.
export async function changeOrderStatus(
  ctx: AuthedCtx,
  input: { orderId: string; status: OrderStatus },
) {
  return db.transaction(async (tx) => {
    // Load the pre-image AND check ownership in one query (Rule 2, Rule 7).
    const [prev] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, input.orderId), eq(orders.ownerId, ctx.auth.userId)));
    if (!prev) throw new TRPCError({ code: "NOT_FOUND" }); // also covers "not yours"

    const [updated] = await tx
      .update(orders)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(orders.id, input.orderId))
      .returning();

    // Same tx → atomic with the update. Diff built from the pre-image already in memory.
    await recordAuditEvent(tx, {
      actorId: ctx.auth.userId,
      action: "order.status_changed",
      entityType: "order",
      entityId: updated.id,
      scopeId: updated.ownerId,
      diff: { status: { from: prev.status, to: updated.status } },
    });

    return updated;
  });
}
```

If the update throws, the audit insert never commits; if the audit insert throws, the update
rolls back. There is never a change without its record, nor a record without its change.

## 2. Revoke UPDATE/DELETE at the database (defense in depth)

The first line of defense is that no tRPC procedure offers an update/delete for the table. The
second, where the driver/role model allows it (Neon/Postgres roles), is to revoke the grants in
the migration so even a buggy or malicious query cannot mutate history.

```sql
-- in the drizzle migration that creates audit_log; hand to migration-author for a live schema.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit_log FROM app_role;
-- app_role keeps INSERT + SELECT only.
```

On Turso/libSQL where per-table role grants are unavailable, rely on the no-procedure rule plus
the hash chain below, and record that constraint in `DECISIONS.md`.

There is **no soft delete** here. A `deleted_at` on an audit table is a contradiction — a way
to make records disappear from an immutable log. Corrections are a new compensating entry
(e.g. `action: "order.status_changed"` reverting the value), never an edit.

## 3. Redact before persisting (Rules 8, 9)

Never store raw rows or request bodies. Strip secret/PII keys and truncate large values so the
log records *what changed* without leaking what must not be stored.

```ts
// src/server/audit/redact.ts
const REDACT_KEYS = new Set(["password", "token", "secret", "ssn", "card", "cvc", "apiKey"]);
const MAX = 512;

function scrub(v: unknown): unknown {
  if (typeof v === "string") return v.length > MAX ? v.slice(0, MAX) + "…" : v;
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v).map(([k, val]) =>
        REDACT_KEYS.has(k) ? [k, "[redacted]"] : [k, scrub(val)],
      ),
    );
  return v;
}

export function redactDiff(diff: Record<string, { from: unknown; to: unknown }>) {
  return Object.fromEntries(
    Object.entries(diff).map(([field, { from, to }]) => [
      field,
      REDACT_KEYS.has(field)
        ? { from: "[redacted]", to: "[redacted]" }
        : { from: scrub(from), to: scrub(to) },
    ]),
  );
}
```

For money fields, the diff carries integer minor units (Rule 5), not formatted dollars.

## 4. Optional: hash-chain for tamper-evidence

When compliance needs proof that no row was altered or removed (not just that the app does not
offer the operation), chain each row to its predecessor. Any deletion or edit then breaks the
chain and is detectable on audit.

Build the canonical string once, then hash it with whichever primitive the runtime offers.

```ts
function canonicalize(prevHash: string, e: AuditInput & { id: string; createdAt: Date }): string {
  return JSON.stringify({
    id: e.id, actorId: e.actorId, action: e.action,
    entityType: e.entityType, entityId: e.entityId, diff: e.diff,
    createdAt: e.createdAt.toISOString(), prevHash,
  });
}

// EDGE runtime (this stack's target): Web Crypto, available as the global `crypto`. Async.
export async function rowHashEdge(
  prevHash: string,
  e: AuditInput & { id: string; createdAt: Date },
): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalize(prevHash, e)));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// NODE runtime only (background job / non-edge worker): node:crypto. Synchronous.
// import { createHash } from "node:crypto";
// export function rowHashNode(prevHash, e) {
//   return createHash("sha256").update(canonicalize(prevHash, e)).digest("hex");
// }
```

Use `rowHashEdge` on the edge deployment; the `node:crypto` variant only where a Node runtime
is guaranteed. Both produce the same hex digest over the identical canonical string.

Store `prev_hash` and `row_hash` columns; the verifier re-walks the chain in `created_at`/`id`
order and recomputes each hash. A mismatch means the log was tampered with. This is a real cost
(serialized writes per scope to order the chain), so adopt it only when required and record the
decision in `DECISIONS.md`.

## Checklist

- [ ] No `updated_at`, no `deleted_at` on the audit table.
- [ ] No update/delete tRPC procedure references the audit table.
- [ ] UPDATE/DELETE/TRUNCATE revoked from the app role where the driver supports it.
- [ ] Every audit insert goes through `recordAuditEvent(tx, …)` inside `db.transaction`.
- [ ] `actor_id` is `ctx.auth.userId` or an explicit `system:*` sentinel — never null/faked.
- [ ] `created_at` is `timestamptz` defaulting to `now()` (UTC); converted only at display.
- [ ] Diff is redacted (no secrets/PII), money as integer minor units.
- [ ] Feed read is a `protectedProcedure` scoped by `scope_id`/ownership, cursor-paginated.
