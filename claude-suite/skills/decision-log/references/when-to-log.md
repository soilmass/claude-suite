Purpose: the triage that decides fork-worthy vs rule-application vs ADR-worthy, the generating skills that route forks here, and the grep-first idempotency and supersession rules.

# When to log (and when not)

## The three-way triage

For anything you're tempted to log, sort it into exactly one bucket:

| Bucket | Test | Action |
| --- | --- | --- |
| **Rule-application** | You applied a rule/spine point with no open choice. | Log **nothing**. |
| **Fork** | `CLAUDE.md` left a default abstract, or offered options, and you picked one. | One `DECISIONS.md` entry (this skill). |
| **ADR-worthy** | The choice needs framed context, an option set, and consequences; multi-consequence or hard-to-reverse. | `draft-adr` writes the ADR; then a one-line `DECISIONS.md` pointer here. |

### Rule-application — do NOT log

These are the spine working as designed; an entry would be noise:

- Using `protectedProcedure` + an ownership check (Rule 2) — that's required, not a decision.
- Storing a timestamp as `timestamptz` UTC (Rule 6) — the default, no fork.
- Adding `created_at` / `updated_at` to a table — a schema convention, not a choice.
- Sharing one Zod schema between tRPC input and the form — the mandated pattern.

If you can't name an *abstract default* or an *open option* in `../../CLAUDE.md` that this
overrides or selects, it is rule-application. Skip it.

### Fork — log one entry

The spine states several defaults *in the abstract* and explicitly leaves some calls per-case.
Resolving any of these is a fork worth one entry:

- **Money (Rule 5):** integer minor units **or** a typed decimal — which, and why.
- **IDs:** UUIDv7 for public-facing **or** BIGSERIAL for internal-only — per table.
- **Soft vs hard delete:** "an explicit call, not a default" — per entity.
- **Driver class:** Neon serverless **or** Turso/libSQL — within the edge-compatible set.
- **jsonb escape hatch:** normalizing vs a `jsonb` column for schemaless, non-queried data.
- **A justified deviation from any of the nine rules** (rare; must carry a safety argument).

### ADR-worthy — hand to draft-adr

Push to `draft-adr` (not a `DECISIONS.md` stub) when the decision:

- changes a **spine** element (framework, ORM, auth provider, deployment target), or
- has **multiple live options** each with non-trivial consequences, or
- is a **one-way door** (expensive to reverse), or
- needs evidence/trade-off analysis — front that with `adr-research`.

The ADR holds the depth; `decision-log` then leaves a one-line pointer entry so the fork is still
discoverable from `DECISIONS.md`.

## Generating skills that route forks here

These skills resolve forks in their normal course and their steps say "record in `DECISIONS.md`."
When they do, the record is this skill's entry:

- `schema-design` — ID strategy, soft/hard delete, jsonb vs normalized, per table.
- `migration-author` / `refactor` — a representation change (e.g. decimal → cents) that supersedes
  an earlier decision.
- `money-modeling` — minor-units vs decimal per monetary column.
- `uuidv7-ids` — UUIDv7 vs BIGSERIAL per table.
- `soft-delete-pattern` — soft vs hard per entity.
- `neon-turso-driver` — which edge driver, and why.
- `multitenancy-scoping` — the tenancy/ownership scoping model chosen.
- `vertical-slice` — any of the above surfaced while building a feature end to end.

## Grep-first idempotency

Before writing, search `DECISIONS.md` for the fork's keywords (the table name, the concept):

1. **Match found, same decision** → stop; cite the existing entry. Duplicates rot the log.
2. **Match found, you are reversing it** → append a new dated entry; set the old entry's `Status`
   to `Superseded by <new date>`. Do not edit the old body. See `entry-format.md`.
3. **No match** → write a fresh `Accepted` entry.

## Supersession discipline

- One fork, one *active* (`Accepted`) entry at a time. Older positions stay as `Superseded`.
- A superseding entry's `Fork` field names what it supersedes ("Supersedes 2026-06-26 — <reason>").
- Never collapse a chain by deleting intermediate entries; the dated trail is the audit value.
- If a supersession is itself architectural (e.g. swapping the ORM after the fact), it's
  ADR-worthy — route through `draft-adr` and leave the pointer here.
