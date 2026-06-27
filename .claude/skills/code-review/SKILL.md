---
name: code-review
description: >
  General code-quality review of a diff, ABOVE the mechanical nine-rule floor: readability,
  naming, dead code, duplication, cyclomatic and cognitive complexity, cohesion, and whether
  the change sits at the right layer of the decided stack (thin tRPC procedure, plain business
  function, typed component). It is the human-judgment pass — the things a linter can't score —
  triaged by severity with a concrete suggestion per finding, not a vague "could be cleaner."
  Use when: "review my code", "code review", "is this clean", "review the diff for quality".
  Do NOT use for: the nine inviolable rules (use rule-audit), or type-chain depth and inference
  breaks (use type-chain-audit).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the quality-review gap: a diff that passes rule-audit and
    compiles but is unreadable, mis-named, duplicated, over-nested, or built at the wrong layer.
    Baseline observed (clean-room capture).
---

# code-review

The judgment-level review pass for a diff on the decided stack. `rule-audit` proves the nine
inviolable rules hold and `type-chain-audit` proves inference is unbroken; both are mechanical.
This skill covers everything those can't score — naming, readability, dead code, duplication,
complexity, cohesion, and layering — and returns a severity-triaged list with a concrete fix
per finding.

The spine and the nine rules live in `../../CLAUDE.md`; this skill does not re-check them
(that is `rule-audit`'s job) but it cites them where a quality smell is also a rule risk —
e.g. a fat procedure that inlines business logic (spine: thin procedures) often hides a missing
ownership check (Rule 2).

---

## When to Use

- A `vertical-slice` or `refactor` just produced a diff and you want a quality read before PR.
- Someone asks "is this clean?", "review the diff", or wants a second pass beyond the gates.
- A PR compiles and passes `rule-audit` but feels hard to follow, repetitive, or over-engineered.
- You are reviewing someone else's branch and want a structured, severity-ranked finding list.

## When NOT to Use

- You are checking the nine inviolable rules (ownership, float money, four states, N+1, etc.)
  → `rule-audit` owns those; this skill assumes they already pass.
- You are tracing `any`/`@ts-ignore`/inference breaks across the type chain → `type-chain-audit`.
- You are assessing accessibility → `a11y-gate`; security/abuse cases → `security-pass`;
  performance budgets → CI handles those.
- You want to actually perform the cleanup, not just name it → this skill names and prioritizes;
  hand the findings to `refactor` to execute a sweeping change.

---

## Procedure

1. **Scope the diff and confirm the floor passed (low-interrogation).** Run `git diff` for the
   change set. Confirm (or assume on the user's word) that `rule-audit` and `type-chain-audit`
   are clean — if a nine-rule violation surfaces, route it there, don't relitigate it here. See
   `references/review-checklist.md`.

2. **Read for intent before style.** Understand what the change is trying to do before judging
   how. A "cleaner" suggestion that misreads intent is noise. Note the entry points: which tRPC
   procedure, which function, which component, which Drizzle query changed.

3. **Check layering against the spine (medium-interrogation).** The cost of a mis-placed
   responsibility compounds. Verify procedures stay thin (validate → authorize → call function →
   return) with business logic in plain functions; components don't embed data orchestration that
   belongs in a hook; Zod schemas are shared, not duplicated. See `references/review-checklist.md`.

4. **Score complexity and cohesion, not just lines.** Flag deep nesting, long parameter lists,
   boolean-flag params, functions doing two jobs, and modules whose pieces don't belong together.
   Prefer early returns and extraction. Calibrate: a 6-branch edge-runtime handler with subtle
   ordering warrants more scrutiny than a flat mapper. See `references/quality-heuristics.md`.

5. **Hunt dead code and duplication.** Unused exports, commented-out blocks, unreachable
   branches, copy-pasted logic that should be one helper (a shared util, a Drizzle query builder,
   a tRPC middleware). Name the consolidation target precisely. See `references/quality-heuristics.md`.

6. **Judge naming and readability concretely.** Vague names (`data`, `handle`, `tmp`, `doStuff`),
   misleading names, abbreviations, and comments that restate code instead of explaining why.
   Every naming finding proposes the better name. See `references/quality-heuristics.md`.

7. **Triage and report by severity.** Group findings: **blocking** (must fix before merge),
   **should-fix** (address this PR), **nit** (optional). Each finding: file:line, the smell, and
   a concrete suggestion. If you propose a project-wide convention (naming, a shared helper home),
   record it in `DECISIONS.md` rather than asserting it silently. See `references/review-checklist.md`.

---

## Composes With

- **Pairs with:** `rule-audit` — run it first for the mechanical nine-rule floor; this skill is
  the judgment layer on top. Together they are the full pre-PR review.
- **Pairs with:** `refactor` — this skill names what to clean and why; `refactor` executes the
  sweeping change across the type chain with the compiler as ground truth.
- **Runs against:** the diff produced by `vertical-slice` or `refactor`.
- **Hands off:** nine-rule violations → `rule-audit`; type-chain/inference breaks →
  `type-chain-audit`; a11y → `a11y-gate`; security/abuse → `security-pass`; the actual edit work
  to apply blocking findings → `refactor`.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project conventions). The encoded failure class was confirmed.

**Observed run.** Shown a planted-flaw `createOrder` tRPC mutation, the naive reviewer caught the local, well-known smells — `z.any()` input, the per-item N+1 `findFirst` loop, the unguarded null deref, the `unused = 42` dead variable, opaque names, the redundant two-pass total, and the nested `if` pyramid — and correctly voted "Request changes." But it framed the verdict around the crash and the unvalidated input, never naming the two project-specific failures: that business logic is **inlined in the procedure** at all (spine: procedures stay thin, logic lives in a plain function) and that the total is summed as a **float** (Rule 5 — money is integer minor units), which it instead softened to "if price is a float this accumulates rounding error."

```ts
for (const i of data) {
  const p = await ctx.db.query.products.findFirst({ where: eq(products.id, i.id) });
  if (i) { if (i.qty) { if (i.qty > 0) { tmp.push(p.price * i.qty); } } }
}
let t = 0; for (const x of tmp) t += x;   // float total; no order row ever inserted
return { total: t };
```

**Failure class (confirmed).** A general reviewer reliably finds the textbook defects (N+1, null deref, dead code) but reads the diff in isolation, with no model of the decided stack — so it misses layering violations (logic that belongs in a plain function, not the procedure) and treats stack invariants like float-money as conditional style advice rather than hard rule breaks. This skill closes that gap by judging the change against the spine and the nine rules, and by triaging each finding to a definite severity instead of a hedge.

---

## Examples

**Input:** "Review the diff for my new `invoice.create` procedure and its form."
**Output:** Triaged list. Blocking: the procedure inlines tax + total computation (30 lines) —
extract to `computeInvoiceTotals()` so the procedure stays thin and the logic is unit-testable
(spine). Should-fix: `const d = input.lines` → rename `lines`; the empty-state copy is duplicated
between this form and `quote` form, extract a shared component. Nit: a leftover
`// console.log(input)` and an unused `formatCents` import. Each with file:line and the concrete
change. (Float-money and ownership were already confirmed by `rule-audit`.)

**Input:** "Is this clean?" on a refactor that touched five files.
**Output:** Layering pass first: a component now does its own `fetch` orchestration that should be
a `use*` hook — flagged should-fix with the extraction target. Complexity: one function grew to
cyclomatic ~14 via nested conditionals; suggest early returns + a guard clause, with the rewritten
shape sketched. Duplication: same `and(eq(...), eq(...userId))` filter repeated in four queries —
propose a `scopedToUser()` helper and note it in `DECISIONS.md`. No nine-rule findings (defer to
`rule-audit`).

**Input:** "Review this PR" where everything is genuinely fine.
**Output:** "No blocking or should-fix findings. Two nits: `tmp` → `nextCursor` in
`pagination.ts:22`; the JSDoc on `listProjects` restates the signature, drop it or explain the
ownership scoping. Mechanical floor (nine rules, type chain) not re-checked here — confirm
`rule-audit` is green." Honest, short, still concrete.

---

## Edge Cases

- **A nine-rule violation surfaces mid-review** → don't fix it here; name it and route to
  `rule-audit` (or `type-chain-audit` for inference). This skill assumes the floor passed.
- **The "cleanup" you want would change behavior** → that is not a quality nit, it is a change.
  Flag it as a question to the author, don't silently propose a behavioral rewrite.
- **The diff is huge / generated / vendored** → review the authored hand-written portions; call
  out that generated or vendored files (e.g. `drizzle/` migrations, shadcn primitives) are
  out of scope rather than nit-picking machine output.
- **Subjective style with no project convention** → propose one and record it in `DECISIONS.md`
  instead of asserting a personal preference as a blocking finding.

## References

- `references/review-checklist.md` — the ordered review pass (scope → intent → layering →
  complexity → dead code → naming → triage), the severity rubric (blocking/should-fix/nit), and
  the finding format (file:line + smell + concrete fix).
- `references/quality-heuristics.md` — stack-specific smells and their fixes: fat procedures,
  component-embedded data orchestration, duplicated Drizzle filters/cursor blocks, deep nesting
  vs. early returns, boolean-flag params, naming anti-patterns, and dead-code tells.

## Scripts

`scripts/` is reserved. A signal that would justify one: a diff-stats helper that flags files
exceeding a complexity/length threshold to focus the human pass — but complexity scoring is
judgment, not a structural check, so until a deterministic heuristic proves its worth this skill
stays script-free.
