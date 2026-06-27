Purpose: map a captured output to concrete rule-numbered defects, then rewrite the baseline section to the exact shape the linter requires.

# Grading: output → defect → rule number

Walk the captured output against the nine rules in `../../CLAUDE.md`. For each defect, write one
specific line: what the model did, then the rule it breaks. This is the same lens `rule-audit`
applies — borrow its rubric.

| What you see in the captured output                                  | Defect / rule |
|----------------------------------------------------------------------|---------------|
| `any`, `@ts-ignore`, untyped `fetch`/`JSON.parse` across a boundary  | Rule 1 |
| Query/mutation on a user-owned row with no `eq(table.userId, ctx.auth.userId)` | Rule 2 |
| Raw hex, arbitrary `px`, magic spacing in `className`                 | Rule 3 |
| Component renders success only — no loading/empty/error branch       | Rule 4 |
| `real(...)`/`number`-as-dollars for money                            | Rule 5 |
| `timestamp` without timezone, or local-time storage                  | Rule 6 |
| A query inside `.map()`/loop over rows                               | Rule 7 |
| tRPC input / route param / webhook body used without a Zod parse     | Rule 8 |
| Secret in `NEXT_PUBLIC_*` or referenced in a Client Component        | Rule 9 |

A skill usually targets ONE rule or a small cluster. The captured defects should center on the
rule the skill claims to fix; incidental defects can be noted but the headline defect must match.

# Decide before you rewrite

- **Defects real and on-target** → proceed to rewrite.
- **Output correct / no defect** → the skill over-fits. Do NOT fake a baseline. Record in
  `DECISIONS.md` (date + "base model already handles X; recommend merge into <sibling>") and hand
  back to `skill-create`.
- **Defect intermittent** → phrase as probabilistic ("~2 of 3 runs omit the ownership filter").

# Rewriting the section — exact shape

Constraints from `skill-create`'s `lint-skill.mjs`:
- The heading must stay **verbatim**: `## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)`.
  (The linter and `suite-audit` grep this text to detect un-baselined skills. Keep it until a
  real transcript replaces the *content*; the parenthetical stays so re-baselining is detectable.)
- The literal string `Failure class encoded:` must still be present.

Replace the placeholder *content*, not the heading. Before (placeholder):

```
## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)

> Encoded failure class per the suite's design; replace with a real transcript.

**Failure class encoded:** <imagined defects>.
```

After (observed):

```
## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)

> Observed 2026-06-26, base model <id>, skill not loaded. Task: "<verbatim task>".

<a short, verbatim excerpt of the model's actual output — the offending lines>

**Failure class encoded:** <the real defects, each with its rule number — e.g. stored `price`
as `real(...)` (Rule 5); the `updateInvoice` mutation filtered only by `invoiceId`, never by
`ctx.auth.userId` (Rule 2)>.
```

Keep the excerpt tight (the offending lines, not the whole file) and the defect list to the 3–5
concrete things that actually shipped. Bump the skill's `changelog` note from "Baseline section
is the encoded failure class; replace with an observed transcript." to record the capture date
and model.

# After rewriting

Run `node ../skill-create/scripts/lint-skill.mjs <skill-dir>` and confirm `0 finding(s)`. Then
report: the task run, the model, the defects with rule numbers, and the applied diff.
