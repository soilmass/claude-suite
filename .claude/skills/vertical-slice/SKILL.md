---
name: vertical-slice
description: >
  Build a complete type-safe feature slice on the decided edge stack: a Drizzle model
  → a thin tRPC procedure with auth AND ownership checks → one shared Zod schema → a
  React Hook Form → a component rendering all four states, with the type chain unbroken
  end to end.
  Use when: "build the X feature", "add Y", "create the Z page/flow", "implement this",
  "wire up the form for", "make the endpoint and UI for".
  Do NOT use for: designing the schema from scratch (use schema-design), authoring a
  migration (use migration-author), running quality gates (use rule-audit, a11y-gate,
  security-pass), or sweeping changes across an existing feature (use refactor).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft from the capability-map suite. Retargeted from Prisma to
    Drizzle/edge per DECISIONS.md. Baseline section is the encoded failure CLASS;
    replace with a real observed transcript before treating this skill as evaluated
    (per building-skills Stage 3).
---

# vertical-slice

The keystone skill. Most build hours live here, so its leverage is highest. It takes a
feature description and produces the full type-safe chain in one coherent pass, then
self-audits that pass against the inviolable rules before declaring done.

The spine and the nine inviolable rules are defined in `../../CLAUDE.md`. This skill does
not restate them — it obeys and enforces them. When they change, this skill follows.

---

## Non-Negotiable Rules

These exist because each is an observed, compiles-anyway failure in generated slices:

- **Never omit the ownership check.** `protectedProcedure` proves *who* the caller is,
  not *what they may touch*. Every query/mutation over a user-owned row MUST verify the
  row belongs to `ctx.auth.userId`. This is the #1 vulnerability and the most common
  silent omission. If you cannot determine the ownership rule, STOP and ask — do not
  ship a procedure without it and do not guess a permissive default.
- **Never break the type chain to make it compile.** No `any`, no `@ts-ignore`, no
  untyped `fetch`/`JSON.parse` at a boundary. If the types do not line up, the design is
  wrong, not the types.
- **Never ship the happy path alone.** Loading, empty, error, success — all four, every
  data-bound component. A slice with only success is not a smaller slice; it is an
  incomplete one.
- **One Zod schema, shared.** The tRPC input schema and the form schema are the same
  object imported in both places. Two schemas that "match" will drift.

Refuse these rationalizations: "the ownership check is obvious, skip it"; "I'll add the
other states later"; "a quick `any` here unblocks the rest"; "the form can have its own
validation." Each is the exact shape of the failure this skill encodes.

---

## When to Use

- A feature is described and needs to exist end to end (data → API → form → UI).
- An existing entity needs a new operation surfaced through the full stack.

## When NOT to Use

- The schema does not exist yet → `schema-design` first, then return here.
- The change is a migration of existing data/shape → `migration-author`.
- The change is a sweep across an existing feature → `refactor`.
- You are checking finished work → the gate trio (`rule-audit`, `a11y-gate`,
  `security-pass`).

---

## Procedure

Work top-down along the type chain so each layer's types feed the next. Do not start at
the UI; the UI's types must come *from* the chain, not be invented at the leaf.

1. **Interrogate only what's load-bearing (medium-interrogation).** Pull entity shape
   from the existing Drizzle schema and styling from the existing tokens — do not re-ask
   those. Ask, as one short batch, only what behavior genuinely requires and the
   conventions do not fix. Chiefly: **the authorization question** — *who is allowed to
   perform this, and against whose records?* — because the ownership check cannot be
   guessed. Also ask only if genuinely ambiguous: is this a list or a single record;
   does it paginate; is the mutation optimistic. If the conversation already answered
   something, confirm it, do not re-ask.

2. **Model (Drizzle).** If the entity exists, extend it minimally; if a small new table
   is needed and obvious, add it following the schema conventions in `CLAUDE.md`
   (snake_case, PK, `created_at`/`updated_at` timestamptz, FK constraints + indexes). A
   *non-trivial* new entity is `schema-design`'s job — hand off rather than half-model it.

3. **Shared Zod schema.** Define one schema per operation in a shared location, derived
   to agree with the Drizzle types. This single object is imported by both the procedure
   and the form. See `references/type-chain.md` for the exact derivation pattern that
   keeps Drizzle → Zod → form types aligned.

4. **Thin tRPC procedure.** `protectedProcedure` (or `publicProcedure` only if genuinely
   public), `.input(theSharedSchema)`, then: **authorize (ownership check)** → call a
   plain function that holds the logic → return. Keep the procedure thin; business logic
   lives in the called function, not inlined. Use Drizzle relational queries to avoid
   N+1. See `references/trpc-patterns.md`.

5. **Form (React Hook Form).** `useForm` with `zodResolver(theSharedSchema)`. Wire the
   mutation; on a mutation, decide optimistic vs pending-state per the interrogation.

6. **Component — all four states.** Render loading, empty, error, success. Compose
   shadcn/Radix primitives for any interactive behavior; never hand-build it. Style only
   through tokens.

7. **Self-audit before declaring done (completeness check).** Walk the inviolable rules
   in `CLAUDE.md` against what you just wrote: type chain unbroken? ownership check
   present? all four states? one shared schema? no hardcoded style? money/time/ID
   conventions honored? Where something needs the user's call, **say so plainly** rather
   than presenting a happy-path slice as complete — e.g. "Built the model, schema,
   procedure, form, and component with all four states. The ownership check assumes only
   the creator may edit; confirm or tell me the real rule."

8. **Suggest proportionally, apply nothing silently.** Surface the adjacent thing the
   user likely wants: "this mutation should probably be optimistic," "this list will need
   pagination past ~50 rows," "the empty state could use a CTA." Offer; let the user
   decide. If you resolved a fork the project hadn't decided, record it in `DECISIONS.md`.

---

## Composes With

- **Consumes:** `schema-design` (the model it builds on) and `design-tokens` (the styles
  it uses). Both are inputs, not things this skill produces from scratch.
- **Feeds:** `rule-audit`, `a11y-gate`, `security-pass` — its output is what they inspect.
- **Pairs with:** `refactor` — `vertical-slice` creates, `refactor` evolves; the two
  core daily-loop skills.
- **Hands off:** non-trivial schema → `schema-design`; any migration the model change
  implies → `migration-author`.

---

## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)

> The capability map specifies this failure class; treat it as the spec until you run the
> task without the skill and capture a real transcript (building-skills Stage 3). A skill
> written from an imagined baseline fixes an imagined problem.

**Failure class encoded:** Left to itself on "build the X feature," the agent produces a
fat tRPC procedure with logic inlined, breaks the type chain (an `any` or untyped fetch
to make a layer compile), **omits the resource-ownership check** while keeping
`protectedProcedure` (so it looks authorized but isn't), defines a second Zod schema on
the form that drifts from the input schema, and renders only the success state. Each
defect compiles and looks right in a fast review — which is why they ship.

---

## Examples

**Input:** "Add the ability for a user to rename one of their projects."
**Output:** Confirms the ownership rule (only the project's owner may rename) → extends
the `projects` Drizzle model if needed → one shared `renameProjectSchema` (Zod) → a
`protectedProcedure` that checks `project.owner_id === ctx.auth.userId` before updating,
logic in a `renameProject()` function → an RHF inline-edit form on the shared schema → a
component handling loading/empty/error/success → self-audit report → suggestion that the
rename be optimistic with rollback on error.

**Input:** "Build the billing dashboard." (money involved)
**Output:** Interrogates ownership + whether amounts are user-visible → models money as
integer minor units (rule 5) → shared schema → procedure with ownership scoping and no
N+1 over line items (Drizzle join) → component with all four states → flags that currency
formatting happens at the display edge only, and that the empty state needs copy.

---

## Edge Cases

- **Ownership rule genuinely unknown and unanswerable from context** → stop at step 1;
  do not proceed past the procedure. A slice without authorization is not a partial win.
- **The feature needs a brand-new non-trivial entity** → hand to `schema-design`, return
  after.
- **The change alters an existing column's shape/type** → that's a migration; hand the
  schema portion to `migration-author`, keep the API/UI portion here.
- **User asks for "just the endpoint" or "just the form"** → build the requested layer,
  but state which downstream layers and which inviolable rules are therefore unverified,
  so a partial slice isn't mistaken for a done one.

---

## References

- `references/type-chain.md` — the exact Drizzle → Zod → tRPC → RHF → component
  derivation that keeps types aligned without restating them by hand.
- `references/trpc-patterns.md` — thin-procedure shape, the ownership-check pattern, and
  the Drizzle relational-query pattern that avoids N+1.
- `references/component-states.md` — the four-state component template.

## Scripts

`scripts/` is reserved for a future slice scaffolder if repeated test transcripts show
the same boilerplate being reinvented (building-skills Stage 6 signal). Empty for now.
