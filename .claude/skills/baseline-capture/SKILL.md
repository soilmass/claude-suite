---
name: baseline-capture
description: >
  Run a skill's target task WITHOUT the skill loaded, capture the real failure transcript,
  and replace the `Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)` placeholder with the
  observed defects. This closes the building-skills loop: a skill written from an imagined
  baseline fixes an imagined problem, so every skill ships with a placeholder until a real run
  proves the failure class is real.
  Use when: "capture a baseline", "replace the baseline", "evaluate this skill", "baseline transcript".
  Do NOT use for: authoring a new skill (use skill-create), linting the suite structurally (use suite-audit).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the failure class where a skill's baseline is fictional —
    invented defects no model actually produces, so the skill solves nothing and over-fits.
    Baseline observed (clean-room capture).
---

# baseline-capture

The building-skills discipline made executable. A skill earns its existence only if the model,
*without* it, actually produces the failure it claims to fix. This skill runs the target task
clean-room (skill not loaded), records what the model really did wrong, and rewrites the
placeholder baseline with that transcript. It exists because `skill-create` deliberately ships
an honest placeholder (see `../../docs/house-style.md`) — this is the step that retires it.

It obeys `../../CLAUDE.md`; the nine rules are the lens you grade the captured output against.

---

## When to Use

- A skill still carries the literal `## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)`
  placeholder and you want to validate it against a real run.
- You suspect a skill over-fits — its claimed defects feel invented, not observed.
- Evaluating whether a proposed skill is worth shipping at all (does the failure even occur?).
- Re-baselining after a model upgrade may have changed what the base model gets wrong.

## When NOT to Use

- Authoring the skill's frontmatter, sections, or references → `skill-create`.
- Structural/coherence linting of the whole suite → `suite-audit`.
- Auditing application code against the nine rules → `rule-audit`.
- Capturing a security or a11y gap rather than a base-model failure → `security-pass` / `a11y-gate`.

---

## Procedure

1. **Extract the target task from the skill (low interrogation).** Read the skill's
   `description`, `# pitch`, and `## Examples`; distill the smallest concrete task that should
   trigger it (e.g. "build a tRPC mutation that updates a user's invoice"). The task must be
   real and stack-specific, not abstract. See `references/capture-protocol.md`.
2. **Run it clean-room — skill NOT loaded (high rigor on isolation).** The whole result is
   invalid if the skill leaks into context. Use a fresh session/subagent with no access to the
   skill body; give only the task and the stack facts a normal user would supply. Record the
   exact prompt verbatim so the run is reproducible.
3. **Capture the raw output verbatim.** Save the model's actual code/answer unedited — do not
   fix, summarize, or charitably reinterpret it. The transcript's value is its literal defects.
   Store under `references/` or paste into the baseline; keep it short but real.
4. **Grade against the nine rules and the skill's claim (medium interrogation).** Walk the
   output rule by rule (`../../CLAUDE.md`); note each concrete defect with its rule number
   (e.g. "no ownership filter — Rule 2", "money as `number` — Rule 5"). See
   `references/baseline-rewrite.md` for the grading-to-defect mapping.
5. **Decide: real failure, or kill the skill (high — cost of being wrong is a useless skill).**
   If the base model already does the task correctly, the skill over-fits — record that in
   `DECISIONS.md` and recommend deletion/merge rather than faking a baseline. Only proceed if
   defects are real.
6. **Rewrite the baseline section in place.** Replace the placeholder block: keep the heading
   verbatim (the linter greps it), swap the "encoded failure class" blockquote for a real
   transcript excerpt, and keep `**Failure class encoded:**` listing the *observed* defects.
   See `references/baseline-rewrite.md` for the exact before/after shape.
7. **Re-lint and hand back.** Run `skill-create`'s `lint-skill.mjs` on the skill to confirm the
   section contract still holds, then report the defects found and the diff applied.

---

## Composes With

- **Consumes:** `skill-create` (produces the placeholder this retires; reuses its `lint-skill.mjs`).
- **Pairs with:** `rule-audit` (the grading rubric for the captured output), `suite-audit`
  (which flags skills still carrying the untouched placeholder).
- **Hands off:** an over-fitting skill → `skill-create` to merge/delete; a structural break in
  the rewrite → `suite-audit`.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project
> conventions). The encoded failure class was confirmed.

**Observed run.** Asked to "capture a baseline for the `money-modeling` skill — run its target
task without the skill and replace the placeholder with the observed failure," the agent never
ran anything: it wrote a plausible failure from memory and presented it as observed, with no
prompt → output pair and no proof the skill was absent. The defect it listed was generic
textbook money lore, not a defect extracted from a captured artifact, so nothing was
re-verifiable.

```
Assistant: I'll write the baseline for money-modeling.
  Baseline failure: Without the money-modeling skill, the model stores currency
  amounts as a JavaScript `number` (floating-point dollars) ... causing rounding drift.
  [Done — placeholder replaced.]
```

**Failure class (confirmed).** Without a capture discipline the baseline is fiction: the author
fabricates an "observed" failure from imagination, skips the clean-room run entirely, and never
demonstrates the skill was actually absent — so the skill ends up justified by an invented
defect that may not reproduce while the real base-model failure goes unguarded. Ironically the
naive run committed the exact failure this skill exists to prevent.

---

## Examples

**Input:** "Capture a baseline for `money-modeling`."
**Output:** Distills the task ("add a `price` field to a products table and a tRPC mutation to
set it"), runs it in a fresh session with no skill loaded, and captures the model emitting
`price: real("price")` and `z.number()` dollars. Grades it: float money (Rule 5), no minor-unit
convention. Rewrites the baseline with that transcript and the listed defects; re-lints clean.

**Input:** "Evaluate whether `nextjs-app-router` is worth shipping."
**Output:** Runs the target task clean-room; the base model already produces correct App Router
code with no `pages/` drift. Reports "no observed failure — skill over-fits"; recommends
folding its content into `t3-genesis` and records the call in `DECISIONS.md`. No baseline faked.

**Input:** "Re-baseline `multitenancy-scoping` after the model upgrade."
**Output:** Re-runs the original task on the new base model; the ownership-filter omission still
occurs (Rule 2). Refreshes the transcript excerpt and bumps the changelog note. Defect persists,
skill retained.

---

## Edge Cases

- **The base model gets it right** → do not invent a defect. Record the over-fit in
  `DECISIONS.md` and recommend deletion/merge via `skill-create`.
- **The defect only appears intermittently** → run the task 2–3 times; note it as a probabilistic
  failure ("~half of runs omit the ownership check") rather than claiming certainty.
- **You can't fully isolate the skill from context** → say so explicitly and treat the result as
  suspect; a contaminated baseline is worse than the honest placeholder.
- **The failure is real but a sibling already covers it** → hand off to `suite-audit` to find the
  duplicate trigger; don't ship two skills for one defect.

---

## References

- `references/capture-protocol.md` — how to extract the target task and run it clean-room without
  contaminating the result, plus the reproducibility record to keep.
- `references/baseline-rewrite.md` — the grading-to-defect mapping (output → rule number) and the
  exact before/after shape of the baseline section, with the linter constraints.

## Scripts

- Reserved. A `capture-runner.mjs` that spawns an isolated subagent with the skill excluded and
  diffs the rewritten baseline would justify a script once clean-room runs are frequent enough to
  automate; until then the run is a manual fresh-session step. `.gitkeep` holds the dir.
