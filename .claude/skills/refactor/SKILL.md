---
name: refactor
description: >
  Make a sweeping change across the type chain — rename a concept, restructure a model,
  extract a repeated pattern — consistently across Drizzle schema, tRPC, Zod, and UI,
  using the compiler as ground truth to surface every affected site. States full scope
  and gets confirmation before touching anything.
  Use when: "rename X everywhere", "restructure the Y model", "extract this pattern",
  "refactor the Z", "change this concept across the codebase", "pull this into a shared
  helper".
  Do NOT use for: building a new feature (use vertical-slice), authoring the migration a
  schema change implies (use migration-author — refactor hands off to it), or running the
  gates afterward (use rule-audit).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Surfaced by the capability map's depth/breadth audit as the
    second daily-loop skill. Baseline observed (clean-room capture).
---

# refactor

The other daily-loop skill (with `vertical-slice`): one creates, this evolves. Most of a
project's lifespan is spent changing existing code, and the type-chain spine makes a
*complete* refactor uniquely tractable here — which is exactly why an agent's *incomplete*
one is the failure to encode against. Confirm-scope-first, because sweeping changes are
high-blast-radius.

The type chain and rules are in `../../CLAUDE.md`. This skill leans on the compiler that
chain provides.

---

## Non-Negotiable Rules
- **State full scope and get confirmation before changing anything.** A half-applied
  refactor is worse than none. Name what you intend to touch ("this rename hits the
  schema, 3 routers, 1 shared Zod schema, and 7 components — proceed?") and wait.
- **Never introduce `any`/`@ts-ignore` to make a mid-refactor state compile.** The
  compiler errors *are the worklist*; suppressing them discards the one tool that makes
  the refactor safe. Work until the type-checker is green across every site.
- **Hand schema changes to `migration-author`.** Do not write the migration yourself; a
  refactor that silently alters a live table's shape is a data risk.

Refuse: "just start renaming, we'll see what breaks"; "drop an `any` there to keep it
compiling for now"; "change the column and the migration in one go."

---

## When to Use
- A concept/name/model/pattern must change consistently across the existing chain.

## When NOT to Use
- New feature → `vertical-slice`.
- The migration itself → `migration-author`.
- Post-change verification → `rule-audit`.

---

## Procedure

1. **Map the blast radius, then confirm (confirm-scope-first).** Use the compiler and
   search to enumerate every affected site across schema → tRPC → Zod → forms → components.
   Present the full scope and get a yes before editing. This is the load-bearing step.

2. **Apply top-down along the chain.** Change the root (schema/type) first; let the
   compiler light up every downstream break; fix each at the site it points to. The
   type-checker is the worklist — a green build means the sweep is complete, a red one
   names what's left.

3. **Hand off schema/data changes.** If the refactor changes a table's shape, hand that
   portion to `migration-author` (expand-contract) rather than editing the live schema
   directly. Keep the code-side sweep here.

4. **Completeness check via the compiler.** The refactor is not done until the
   type-checker is green across every affected site. Report any site you deliberately left
   unchanged, with the reason — never leave a silent gap.

5. **Suggest adjacent cleanup, but never expand scope unasked.** If the sweep exposes
   related dead code or a second pattern worth extracting, surface it as a follow-up the
   user can approve — don't fold it into this change. Hand the result to `rule-audit`.

---

## Composes With
- **Operates across** the same chain `vertical-slice` builds; pairs with it as the two
  core daily-loop skills.
- **Hands off:** schema changes → `migration-author`; output → `rule-audit`.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project conventions). The encoded failure class was confirmed.

**Observed run.** Asked to rename `project`→`workspace` everywhere, the agent edited only
the three code files in the slice — schema, router, component — and declared it done. It
renamed the exported `workspaceRouter` but never touched the root router that registers it,
so the live key stays `project` while the component calls `api.workspace.list` against a
key that no longer exists. It also missed the directory, the README, several referencing
skill docs, and authored no migration for the literal table rename.

```ts
// renamed export, but ~/server/api/root.ts still has:  project: projectRouter
export const workspaceRouter = createTRPCRouter({ /* ... */ });
// component now calls a key that doesn't exist on AppRouter:
const query = api.workspace.list.useQuery(); // type error / runtime undefined
```

**Failure class (confirmed).** A find/replace within the obvious files leaves a
half-migrated, compiling-but-wrong codebase: the cross-file registration site is missed,
the live Drizzle table rename ships with no expand-contract migration, and nothing is
compiler-verified — so the broken type chain slips through unseen.

---

## Examples
**Input:** "Rename `Project.title` to `Project.name` everywhere."
**Output:** Maps scope: schema column, `$inferSelect` consumers, 2 routers, the shared
`projectSchema`, 5 components → presents it, asks to proceed → changes the Drizzle column
(hands the live-data rename to `migration-author` as expand-contract) → fixes each
compiler error top-down → reports green build, notes one test fixture intentionally left
for the user → hands to rule-audit.

---

## Edge Cases
- **Scope is larger than the user expected** → stop at confirmation; let them narrow or
  approve, don't proceed on assumption.
- **The change is purely additive (no live-data shape change)** → no migration handoff
  needed; say so.
- **Compiler can't reach a dynamic site** (string-keyed access, reflection) → flag it
  explicitly as a site the type chain can't guarantee; it needs manual review.

---

## References
- `references/blast-radius.md` — how to enumerate affected sites across the chain and
  what the compiler can vs cannot catch (dynamic access, string keys).

## Scripts
`scripts/` reserved for a codemod helper if real runs show the same mechanical rename
pattern repeatedly. Empty for now.
