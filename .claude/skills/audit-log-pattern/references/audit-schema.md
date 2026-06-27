Purpose: the append-only audit table in Drizzle and the single validated write helper every mutation calls.

# Audit schema and write helper

## The table

Append-only means the table has a primary key, an actor, an action, a target, a redacted
payload, and a creation timestamp — and nothing else. No `updated_at`, no `deleted_at`: a row
is never updated and never deleted, so neither column has meaning.

```ts
// src/db/schema/audit.ts
import { pgEnum, pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

// Action is a closed set, never free text — so the feed and analytics can group reliably.
export const auditAction = pgEnum("audit_action", [
  "order.created",
  "order.status_changed",
  "order.deleted",
  "member.invited",
  "member.role_changed",
]);

export const auditLog = pgTable(
  "audit_log",
  {
    // UUIDv7: sortable (id desc == created desc) and non-enumerable. Generate app-side.
    id: uuid("id").primaryKey(),

    // The actor. A real Clerk user id (ctx.auth.userId) or a sentinel like "system:billing-cron".
    // NOT NULL on purpose: "unknown who" is a useless audit row (Rule 2).
    actorId: text("actor_id").notNull(),

    action: auditAction("action").notNull(),

    // The target of the action, denormalized so the row is self-describing even if the
    // entity is later hard-deleted.
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),

    // Scopes the feed read (Rule 2). Workspace/org id, or the owner user id for personal data.
    scopeId: text("scope_id").notNull(),

    // Redacted before insert (see immutability.md). { field: { from, to } } shape, or a
    // small event payload — never the whole row, never tokens/PII (Rules 8, 9).
    diff: jsonb("diff").$type<Record<string, { from: unknown; to: unknown }>>(),

    // UTC, set by the DB. Display layer converts to local (Rule 6). NO updated_at/deleted_at.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Index the columns the feed filters/sorts on (Rule 7-adjacent: keep reads cheap).
    byEntity: index("audit_log_entity_idx").on(t.entityType, t.entityId, t.createdAt),
    byScope: index("audit_log_scope_idx").on(t.scopeId, t.createdAt),
    byActor: index("audit_log_actor_idx").on(t.actorId, t.createdAt),
  }),
);

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  // Many-to-one only when the actor is always a real user; with system sentinels, resolve
  // the actor in the read layer instead of an FK.
  actor: one(users, { fields: [auditLog.actorId], references: [users.id] }),
}));
```

Notes:
- **No `relations()` parent FK to the target entity.** `entity_id` is denormalized text so an
  audit row survives the hard-delete of the thing it audited. That is the point.
- **`scope_id` is what the feed read filters by** to satisfy Rule 2 — you query
  `eq(auditLog.scopeId, ctx.auth.orgId)` (or the owner id), never an unscoped table scan.
- **UUIDv7 in app code** (e.g. `uuidv7()` from a tiny lib) so the id is monotonic and doubles
  as the pagination cursor.

## The write helper — the only way to insert

Every mutation calls this; no procedure hand-rolls `db.insert(auditLog)`. It takes the
transaction handle so the entry shares the change's atomic commit.

```ts
// src/server/audit/record.ts
import { z } from "zod";
import { uuidv7 } from "uuidv7";
import { auditLog, auditAction } from "~/db/schema/audit";
import { redactDiff } from "./redact"; // see immutability.md
import type { DbTx } from "~/db"; // the type of the arg drizzle passes to db.transaction(async (tx) => ...)

// Validate the boundary (Rule 8) even though the caller is internal — the action must be a
// known enum value and the actor must be present.
export const auditInput = z.object({
  actorId: z.string().min(1),
  action: z.enum(auditAction.enumValues), // enumValues lives on the pgEnum object, not the column
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  scopeId: z.string().min(1),
  diff: z.record(z.object({ from: z.unknown(), to: z.unknown() })).optional(),
});
export type AuditInput = z.infer<typeof auditInput>;

export async function recordAuditEvent(tx: DbTx, raw: AuditInput) {
  const e = auditInput.parse(raw);
  await tx.insert(auditLog).values({
    id: uuidv7(),
    actorId: e.actorId,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId,
    scopeId: e.scopeId,
    diff: e.diff ? redactDiff(e.diff) : undefined,
    // createdAt omitted → DB default now() in UTC (Rule 6).
  });
}
```

The function is plain business logic the thin procedure calls (per CLAUDE.md), not inlined in
the procedure. Its return type and `AuditInput` trace back to the Drizzle table — unbroken
type chain (Rule 1).
