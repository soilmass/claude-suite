---
name: rule-audit
description: >
  Scan a code diff against the nine inviolable rules of the decided stack and report
  each violation with its location, severity, and a concrete fix. Catches the defects
  that compile and look correct: type-chain breaks, missing ownership checks, hardcoded
  style values, missing component states, float money, local timestamps, N+1 access,
  unvalidated boundaries, and client-side secrets.
  Use when: "audit this", "check before I commit", "review the diff", "is this up to
  standard", "did I break a rule", "PR check".
  Do NOT use for: accessibility review (use a11y-gate), security threat-modeling (use
  security-pass), performance budgets (CI handles those), or writing the feature itself
  (use vertical-slice).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. The nine rules are defined in CLAUDE.md; this skill enforces
    them and does not redefine them. Baseline section is the encoded failure class;
    replace with an observed transcript before treating as evaluated.
---

# rule-audit

The enforcement keystone. Anyone can generate code; enforcing the bar is the hard part,
and "highest degree" lives here. This skill reads a diff and reports violations of the
nine inviolable rules — ranked, located, each with a fix. It is the most
suggestion-heavy skill by design and the least interrogating: the diff is the input.

The nine rules live in `../../CLAUDE.md` and are the single source of truth. This skill
checks against that list and states which rules it checked, so "passed" means something
specific rather than "looked fine."

---

## When to Use

- A diff, file, or feature is finished and headed for commit / PR.
- The user asks whether generated code meets the bar.
- Part of the done-time gate trio, alongside `a11y-gate` and `security-pass`.

## When NOT to Use

- Accessibility specifics → `a11y-gate`.
- Security design / threat-model / headers → `security-pass`.
- Performance budgets → deterministic CI gate, not this skill.
- Generating the code → `vertical-slice` or `refactor`.

---

## Procedure

1. **Take the diff as input; barely interrogate.** The input is the changed code. Ask
   only if scope is genuinely unclear (which files / which commit range). Otherwise run.

2. **Run the mechanical pass first.** Use `scripts/scan.mjs` for the
   machine-detectable subset: `any`/`@ts-ignore`/`@ts-expect-error`, untyped
   `fetch`/`JSON.parse`, raw hex and arbitrary-value `className`, `NEXT_PUBLIC_` on
   suspicious names, `number`-typed money fields, non-`timestamptz` time columns, and
   query-in-loop N+1 shapes. The script flags candidates; it does not judge — it narrows
   where you look.

3. **Run the judgment pass.** Some rules need reading, not regex:
   - **Ownership (rule 2):** for every `protectedProcedure` touching a user-owned row,
     confirm an ownership check exists before the read/write. This is the highest-value
     and least mechanical check — a `protectedProcedure` with no ownership assertion is
     the signature failure.
   - **Four states (rule 4):** for every data-bound component, confirm loading, empty,
     error, success all render.
   - **Validated boundaries (rule 8):** every external input Zod-parsed before use.
   See `references/rule-checklist.md` for the per-rule "what to look for / how it's
   usually missed / the fix."

4. **Rank by severity, not by file order (suggestion-first, completeness check).**
   Report auth holes and type-chain breaks before spacing tokens — the user should fix
   the security/correctness issues first. Every finding carries: the rule number, the
   location, *why* it's a violation, and a concrete fix — never a bare flag. Run the
   **full** rule set every time, not a sample, and **state which rules you checked** so
   "passed" is meaningful.

5. **Distinguish violations from judgment calls.** Where a finding is arguable rather
   than a clear breach, say so ("this *reads* like an N+1 but may be intentional batch
   logic — confirm") rather than asserting. This skill advises; the user decides what to
   act on. It does not auto-fix.

---

## Composes With

- **Runs against:** `vertical-slice` and `refactor` output.
- **Pairs with:** `a11y-gate` and `security-pass` as the three-part definition of done.
- **Shares its rule source** with every generating skill: the same `CLAUDE.md` list they
  were told to obey is the list this scans for. That shared spine is why generation and
  enforcement can't drift.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project conventions). The encoded failure class was confirmed.

**Observed run.** A naive reviewer (no skill) was shown a planted-flaw artifact and asked to review it. It correctly caught the four surface-level rule breaches — the unscoped `remove` delete (Rule 2 IDOR), the `p:any` at the render boundary (Rule 1), the hardcoded hex (Rule 3), and the missing loading/error/empty states (Rule 4) — and returned "Not mergeable." But it missed that the *list query itself* is also unscoped: the same ownership hole as `remove` exists on the read path, and `data ?? []` quietly masks it as a benign empty.

```ts
remove: protectedProcedure.input(z.object({ id: z.string() }))
  .mutation(({ ctx, input }) => ctx.db.delete(posts).where(eq(posts.id, input.id))),
// list: returns ALL posts, not scoped to ctx.auth.userId
{(data ?? []).map((p: any) => <li style={{ color: "#3b82f6" }}>{p.title}</li>)}
```

**Failure class (confirmed).** A reviewer pattern-matches the loud, local defects (a visible `any`, a hex literal, a delete-by-id) and declares a verdict once it has found "enough" — stopping before it runs the *full* rule set across *every* boundary. The danger isn't the missed cosmetic; it's the second instance of the same ownership class on a path the eye already moved past. This skill forces the complete nine-rule sweep over every procedure and component, so a verdict means "all rules checked everywhere," not "found four things."

---

## Examples

**Input:** "Audit this diff before I open the PR." (a new `vertical-slice` feature)
**Output:** Runs `scan.mjs`, then the judgment pass. Reports, ranked:
`[CRITICAL rule 2] src/server/api/routers/invoice.ts:24 — protectedProcedure.delete has
no ownership check; caller can delete any invoice by id. Fix: assert
invoice.ownerId === ctx.auth.userId, throw NOT_FOUND otherwise.`
then `[HIGH rule 1]`, then `[MED rule 3]`, and states: "Checked all nine rules; rules
5, 6, 7, 9 clean."

---

## Edge Cases

- **No diff provided, just "is my code good?"** → ask for the file/range; don't audit the
  whole repo blindly unless asked.
- **A finding is genuinely ambiguous** → flag as a judgment call, don't assert a
  violation.
- **User asks rule-audit to fix the findings** → it can propose the edits, but flag that
  re-running the gate trio on the result is still required; a fix can introduce a new
  violation.
- **A rule in CLAUDE.md changed** → audit against the current CLAUDE.md, not a remembered
  version; `perishable-refresh` keeps that list current.

---

## References

- `references/rule-checklist.md` — per-rule: what to look for, how it's usually missed,
  the fix. The judgment-pass companion to the script.

## Scripts

- `scripts/scan.mjs` — the mechanical pass: flags machine-detectable candidates for the
  nine rules. Narrows where the human/judgment pass looks; never the sole verdict.
- `scripts/README.md` — usage and the explicit list of what the script can and cannot
  detect (so its silence is never mistaken for a clean judgment pass).
