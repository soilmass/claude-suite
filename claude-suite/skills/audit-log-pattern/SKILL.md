---
name: audit-log-pattern
description: >
  Design an append-only audit / event-log table on the edge stack: an immutable
  who-did-what-when record with the actor (`ctx.auth.userId`), the action, the target
  entity, a before/after diff, and a UTC `timestamptz` — written in the same transaction
  as the change it records, never updated or deleted after insert. Covers the Drizzle
  schema, the write helper that every mutation calls, immutability enforcement (revoked
  UPDATE/DELETE grants), and read/query patterns for an activity feed.
  Use when: "audit log", "activity log", "track changes", "event log table".
  Do NOT use for: application/operational logging — stdout, levels, sampling, Sentry
  (use log-discipline); designing non-audit domain tables from scratch (use schema-design).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the mutable-audit-log failure class: a "log" table that
    is UPDATE-able, omits the actor, stores local time, or is written best-effort outside
    the transaction. Baseline section is the encoded failure class; replace with an
    observed transcript.
---

# audit-log-pattern

The build-loop skill for the one table whose entire value is that it cannot be altered after
the fact. Given "track who changed this order" or "show an activity feed," it produces an
append-only Drizzle table plus a single write helper every mutation calls inside its
transaction — capturing actor, action, target, and a before/after diff at UTC. An audit log
you can edit is not an audit log.

The spine and the nine inviolable rules live in `../../CLAUDE.md`. This skill does not restate
them; it leans hardest on Rule 6 (UTC `timestamptz`), Rule 2 (the actor is `ctx.auth.userId`),
Rule 8 (the recorded payload is validated), and Rule 9 (no PII/secrets in the entry).

---

## Non-Negotiable Rules

An audit log fails silently: the defect only surfaces during the incident review when the
record you needed was overwritten or never written. Hard lines:

- **Never expose UPDATE or DELETE on the audit table.** Append-only means insert-only. The
  table has no edit procedure, no soft-delete column, and — where the driver allows — the
  app role's UPDATE/DELETE grants are revoked. Corrections are a new compensating entry.
- **Never write the audit entry outside the mutation's transaction.** The entry and the
  change it records commit together or not at all. A best-effort `void log(...)` after the
  commit drops records exactly when the system is under stress.
- **Never record an entry without a concrete actor and a UTC timestamp.** Capture
  `ctx.auth.userId` (Rule 2) — or an explicit `system` sentinel for jobs — and a
  `timestamptz` defaulting to `now()` (Rule 6). "Unknown who, unknown when" is useless.
- **Never dump raw rows into the entry.** Store a validated, redacted diff (Rule 8) with
  secrets, tokens, and PII stripped (Rule 9) — not the whole record, not the request body.

Refuse these rationalizations: "we'll just soft-delete bad audit rows"; "logging it after
the commit is fine, it almost always lands"; "store the full row, we'll figure out the diff
later"; "the userId is implied by the session, no need to denormalize it onto the row."

---

## When to Use

- A user-owned or compliance-sensitive entity needs a tamper-evident history of changes.
- The product needs an activity feed: "who did what, when" over an entity or workspace.
- A mutation must leave a durable trail (status transitions, permission grants, money moves).
- You are adding change-tracking to an existing `vertical-slice` mutation.

## When NOT to Use

- You need operational/diagnostic logging (stdout, levels, sampling, Sentry breadcrumbs) →
  `log-discipline` owns that; it is ephemeral, this is a durable record.
- You are modeling ordinary domain tables and their relations → `schema-design`.
- You are adding the audit table to a schema already in production → design it here, then
  hand the DDL + revoked-grants migration to `migration-author`.
- You want tracing/metrics for cost and latency → `observability-setup`.

---

## Procedure

1. **Decide the granularity and what an "entry" is (medium-interrogation).** Per-field
   change vs. per-action event vs. snapshot. Name the actions you must answer for (who
   changed status? who deleted it?). You cannot backfill history you never captured. Record
   the granularity choice in `DECISIONS.md`.

2. **Design the table for append-only with a typed action enum.** Columns: `id` (UUIDv7,
   sortable), `actor_id` (the `ctx.auth.userId` or a `system` sentinel), `action` (pgEnum,
   not free text), `entity_type` + `entity_id` (the target), `diff`/`metadata` (`jsonb`,
   redacted), and `created_at timestamptz` default `now()`. No `updated_at`, no
   `deleted_at` — immutability means neither applies. See `references/audit-schema.md`.

3. **Enforce immutability at the boundary the driver gives you.** At minimum: no
   update/delete tRPC procedure touches the table. Where the edge driver/role model allows,
   revoke UPDATE/DELETE on the table from the app role in the migration. Optionally hash-chain
   each row (`prev_hash`) for tamper-evidence. See `references/immutability.md`.

4. **Define one write helper and route every mutation through it.** A single
   `recordAuditEvent(tx, { actorId, action, entityType, entityId, diff })` that takes the
   transaction handle so the entry shares the change's atomic commit (Rule 8 validates its
   input). No mutation hand-rolls an insert. See `references/audit-schema.md`.

5. **Call the helper inside `db.transaction` next to the change.** The domain write and the
   audit insert run on the same `tx`; if either throws, both roll back. Compute the diff from
   the pre-image you already loaded for the ownership check (Rule 2) — no extra query
   (Rule 7). See `references/immutability.md`.

6. **Redact before persisting.** Run the diff through a Zod transform that strips secret/PII
   keys and truncates large blobs (Rules 8, 9) — the entry records *that* a field changed and
   its non-sensitive value, never tokens or request bodies. See `references/immutability.md`.

7. **Query the log read-only, scoped and bounded.** The activity-feed read is a
   `protectedProcedure` filtering by `entity_id`/`scope_id` (ownership, Rule 2), ordered by
   `created_at desc`, cursor-paginated by the sortable `id` — never an unbounded scan.
   Convert `created_at` to local time only at the display edge (Rule 6).

---

## Composes With

- **Consumes:** `schema-design` — the audit table follows its snake_case/PK/timestamptz
  conventions; the entity tables it references are defined there.
- **Pairs with:** `observability-setup` — traces/metrics are the ephemeral cost-managed
  signal; this is the durable, queryable record. They answer different questions.
- **Pairs with:** `log-discipline` — operational logs are sampled and droppable; audit
  entries are neither. Use both, never conflate them.
- **Hands off:** adding the table or revoking grants on a live schema → `migration-author`;
  the mutations that call the write helper are built by `vertical-slice`.

---

## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)

> This is the encoded failure class, not a captured transcript. Replace it after running the
> task without the skill and recording what the agent actually does.

**Failure class encoded:** Asked to "add an audit log for order changes," the agent creates
an `audit_logs` table with `updated_at`/`deleted_at` columns and an `update`/`delete`
procedure (so the "immutable" record is fully editable), stores `action` as a free-text
`varchar` ("updated", "Updated", "edit" all coexist), writes the entry with a fire-and-forget
`void recordLog(...)` *after* the transaction commits (so it silently drops under load and
can commit a half-truth), omits the actor entirely ("the session knows who it is"), stores
`new Date().toISOString()` computed in the server's local zone instead of a `timestamptz`
default (Rule 6), and dumps the entire updated row — including a payment token — into a
`jsonb` `data` column (Rules 8, 9). It compiles, the feed renders, and the first real
incident review finds the one row that mattered was overwritten the next day.

---

## Examples

**Input:** "Record who changed an order's status and to what."
**Output:** A pgEnum `audit_action` (`order.status_changed`, …); an `order_audit` row written
inside the status mutation's `db.transaction`:
`await recordAuditEvent(tx, { actorId: ctx.auth.userId, action: "order.status_changed", entityType: "order", entityId: order.id, diff: { status: { from: prev.status, to: input.status } } })`.
Actor from `ctx.auth.userId` (Rule 2), diff built from the already-loaded pre-image (Rule 7),
`created_at` defaults to UTC `now()` (Rule 6), same transaction as the status update (Rule 8).

**Input:** "Show an activity feed for this project."
**Output:** A read-only `protectedProcedure`:
`db.query.projectAudit.findMany({ where: and(eq(projectAudit.entityId, input.projectId), eq(projectAudit.scopeId, ctx.auth.orgId)), orderBy: (a, { desc }) => desc(a.id), limit: 20 })`,
cursor-paginated by the UUIDv7 `id`; timestamps formatted client-side at display (Rule 6);
the component renders all four states (Rule 4).

**Input:** "We need to make the audit log tamper-evident for compliance."
**Output:** Add `prev_hash` + `row_hash` (sha-256 over the canonical entry + previous hash) so
any deletion or edit breaks the chain; revoke UPDATE/DELETE on the table from the app role in
the migration. See `references/immutability.md`. Record the choice in `DECISIONS.md`.

---

## Edge Cases

- **A background job or webhook is the actor, not a user** → record an explicit `system`
  (or the integration's id) sentinel in `actor_id`; never leave it null or fake a user id.
- **The user has the right to erasure (GDPR) but the audit must persist** → pseudonymize the
  actor (store a stable opaque id, delete the PII mapping) rather than deleting audit rows;
  record the policy in `DECISIONS.md`.
- **A bulk operation changes 10k rows** → write one summary event per action plus affected
  ids/count, not 10k entries inside one transaction; do not loop per-row inserts (Rule 7).
- **You "need" to correct a wrong audit entry** → you cannot; append a compensating entry
  referencing the original. Editing the table at all defeats its purpose.

## References

- `references/audit-schema.md` — the append-only Drizzle table (UUIDv7 id, pgEnum action,
  entity_type/entity_id, redacted jsonb diff, UTC created_at, no updated/deleted), the
  `relations()`, and the validated `recordAuditEvent(tx, …)` write helper.
- `references/immutability.md` — enforcing append-only: revoked UPDATE/DELETE grants, the
  in-transaction call pattern, diff-from-pre-image, the Zod redaction transform, and optional
  hash-chaining for tamper-evidence.

## Scripts

`scripts/` is reserved. A signal that would justify one: a static check that greps the schema
for an `updated_at`/`deleted_at` column or an update/delete procedure naming an `*_audit` table
— catching a mutable audit log mechanically. Until that recurs, this skill stays script-free.
