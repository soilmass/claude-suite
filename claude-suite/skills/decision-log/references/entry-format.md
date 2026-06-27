Purpose: the canonical `DECISIONS.md` entry template, field definitions, status lifecycle, the append-and-supersede convention, and worked entries for the common forks.

# DECISIONS.md entry format

`DECISIONS.md` is an append-only, reverse-not-required chronological log. Per `../../CLAUDE.md`,
it **wins over `CLAUDE.md`** because it records the concrete, project-specific resolution of a
fork the spine states only in the abstract. Keep it scannable: newest at the bottom, one entry
per resolved fork, fixed fields.

## File header (create once if absent)

```markdown
# DECISIONS.md — Resolved Forks (wins over CLAUDE.md)

Each entry records one fork the project resolved that `CLAUDE.md` left abstract or open.
Append newest at the bottom. Never edit a past entry — supersede it with a new dated one.
```

## Entry template

```markdown
### YYYY-MM-DD — <short imperative title>

- **Status:** Accepted
- **Fork:** <the abstract default in CLAUDE.md this overrides, or the open option the spine left>
- **Decision:** <what was chosen, concretely — the column type, the ID strategy, the driver>
- **Rationale:** <1–2 lines: why this, and explicitly why NOT the rejected alternative>
- **Scope:** <what it binds: tables / tRPC routers / modules / how far it reaches>
- **Touches:** Rule <N> (resolves | deviates: <reason safe>) · CLAUDE.md §<section>
- **Source:** <skill or feature that surfaced the fork, e.g. `schema-design on orders`>
```

## Field definitions

- **Status** — `Accepted` when live; `Superseded by <YYYY-MM-DD>` when a later entry replaces it.
  Never delete a superseded entry; the trail is the point.
- **Fork** — name the *thing that was genuinely open*. If you cannot point at an abstract default
  or an open option, this is rule-application, not a decision — do not log it.
- **Decision** — concrete and testable. "Decimal" is weak; "`numeric(12,2)` on `orders.total`" is
  an entry a future reader can verify against the schema.
- **Rationale** — the why, *including the rejected branch*. The why-not is the field most often
  dropped and the one that prevents the decision being re-litigated.
- **Scope** — the blast radius. A money-type choice that binds only `orders` is different from one
  that binds every monetary column; say which.
- **Touches** — link the rule number and/or `CLAUDE.md` section. `resolves` = you picked an allowed
  branch of an abstract rule; `deviates` = you went against a rule and must justify why it's safe.
- **Source** — provenance, so a reader traces the decision to the skill/feature that forced it.

## Status lifecycle & supersession

Decisions change. To reverse or narrow one, **append a new dated entry** and edit only the old
entry's `Status` line to `Superseded by <new date>`. Do not rewrite the old Decision/Rationale —
those record what was true then.

```markdown
### 2026-06-26 — orders.total stored as numeric(12,2)
- **Status:** Superseded by 2026-09-01
  ... (original body unchanged) ...

### 2026-09-01 — orders.total moved to integer minor units (cents)
- **Status:** Accepted
- **Fork:** Supersedes 2026-06-26 — decimal caused FX rounding drift at settlement.
- **Decision:** `total_cents bigint`; migrate via expand-contract (see migration-author).
- **Rationale:** integer cents removes accumulated rounding; decimal's readability win was lost
  once multi-currency landed.
- **Scope:** `orders` table + orders router + order form + reconciliation job.
- **Touches:** Rule 5 (resolves, minor-units branch).
- **Source:** `refactor` → `migration-author`.
```

## Worked entries

### Money (Rule 5)

```markdown
### 2026-06-26 — invoices use integer minor units
- **Status:** Accepted
- **Fork:** Rule 5 permits integer minor units OR a typed decimal.
- **Decision:** `amount_cents bigint` (USD-only product).
- **Rationale:** single currency, arithmetic stays exact in JS BigInt-free integer math; decimal
  would add a parse step for no readability gain.
- **Scope:** `invoices`, `invoice_lines`, billing router.
- **Touches:** Rule 5 (resolves, minor-units branch).
- **Source:** `money-modeling on invoices`.
```

### IDs (IDs convention)

```markdown
### 2026-06-26 — audit_log uses BIGSERIAL
- **Status:** Accepted
- **Fork:** IDs convention — UUIDv7 for public-facing rows; BIGSERIAL acceptable internal-only.
- **Decision:** `id bigserial primary key`.
- **Rationale:** append-only, internal-only, never exposed in a URL or API; monotonic int is
  cheaper to index and sort. UUIDv7 would buy non-enumerability we don't need here.
- **Scope:** `audit_log` only — public tables stay UUIDv7.
- **Touches:** CLAUDE.md §Money, time, IDs (resolves, internal branch).
- **Source:** `schema-design` (pairs with `audit-log-pattern`).
```

### Soft delete (per-entity call)

```markdown
### 2026-06-26 — comments hard-delete; posts soft-delete
- **Status:** Accepted
- **Fork:** soft vs hard delete is an explicit per-entity call.
- **Decision:** `posts.deleted_at timestamptz` nullable (soft); `comments` hard-deleted.
- **Rationale:** posts need restore + audit; comments carry no recovery requirement and a tombstone
  would complicate every thread query for no product value.
- **Scope:** `posts`, `comments`; their list queries filter `deleted_at IS NULL`.
- **Touches:** CLAUDE.md §Money, time, IDs (soft vs hard delete).
- **Source:** `schema-design` (pairs with `soft-delete-pattern`).
```

### Deviation from a rule (logged, justified)

```markdown
### 2026-06-26 — feature_flags read in a Client Component via NEXT_PUBLIC_*
- **Status:** Accepted
- **Fork:** Rule 9 forbids secrets in NEXT_PUBLIC_*.
- **Decision:** expose non-secret boolean flags (e.g. NEXT_PUBLIC_FLAG_NEW_NAV) to the client.
- **Rationale:** these flags are public toggles, not secrets — no auth, billing, or data gate
  depends on them; the values leak nothing. Secret-gated flags stay server-side.
- **Scope:** UI-only presentational flags; never authorization flags.
- **Touches:** Rule 9 (deviates — but only non-secret values cross the boundary, so the guard the
  rule protects is intact). Flagged for `rule-audit` so it isn't read as a violation.
- **Source:** `feature-flags`.
```

### Pointer to an ADR (large decision handed off)

```markdown
### 2026-06-26 — Auth provider remains Clerk (ADR-0007)
- **Status:** Accepted
- **Fork:** auth provider (spine names Clerk; a swap was proposed).
- **Decision:** stay on Clerk; see docs/adr/0007-auth-provider.md for options & consequences.
- **Rationale:** full reasoning lives in the ADR; logged here so the fork is discoverable.
- **Scope:** whole app (middleware, every protectedProcedure).
- **Touches:** CLAUDE.md §spine (Auth).
- **Source:** `draft-adr` (ADR-0007); research by `adr-research`.
```
