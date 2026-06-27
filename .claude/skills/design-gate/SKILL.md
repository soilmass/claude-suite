---
name: design-gate
description: >
  The 4th done-time gate: verify design-SYSTEM adherence and craft before a change ships —
  spacings land on the scale, type follows the scale and measure, colors are the harmonized
  semantic roles (and stay colorblind-distinguishable), hierarchy is legible, and the four
  states are crafted not merely present. Suggestion-first, like its sibling gates.
  Use when: "design gate", "design pass", "is this on the design system", "check design
  adherence", "craft review before merge", "run the design gate".
  Do NOT use for: the WCAG contrast floor and a11y conformance (use a11y-gate); whether a
  value is hardcoded vs a token (use rule-audit Rule 3); the open-ended craft critique itself
  (spawn the design-reviewer agent, which this gate consumes).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. The 4th done-time gate, sibling to rule-audit / a11y-gate /
    security-pass. Owns design-system adherence + craft; defers contrast to a11y-gate and
    hardcoding to rule-audit. Baseline section is the encoded failure class; replace with an
    observed transcript.
---

# design-gate

A done-time gate, the fourth alongside `rule-audit`, `a11y-gate`, and `security-pass`.
Suggestion-first like its siblings: no interrogation — it reads the rendered output and the
`@theme` tokens — but it names the specific fix for each finding. Its single question is
**"does this adhere to and use the design system well?"** — distinct from "is it accessible"
(`a11y-gate`) and "does it use *a* token at all" (`rule-audit` Rule 3).

Where the boundaries sit (it defers, never re-owns): contrast ratios and WCAG → `a11y-gate`;
hardcoded-vs-token → `rule-audit` Rule 3; state *presence* (Rule 4) → `rule-audit`. This gate
owns what those cannot see: the value is *on the scale*, the color is the *right role* and
*colorblind-safe*, the hierarchy *reads*, and the states are *crafted*.

The token foundation and the four craft skills it gates against are
`design-tokens` / `color-system` / `typography-system` / `layout-composition` / `motion-system`.

---

## When to Use
- Rendered UI is finished and headed for done; the 4th of the done-time gates.
- The user asks whether a change is "on the design system."

## When NOT to Use
- Accessibility / contrast → `a11y-gate`. Hardcoded values → `rule-audit` Rule 3.
- The open-ended, exploratory craft critique → spawn the `design-reviewer` agent (this gate
  consumes its output and turns it into a pass/fail-with-fixes).

---

## Procedure

1. **No interrogation — read the output and the tokens.** Point at the rendered routes and
   the global `@theme` block. The input is the finished UI; there is nothing load-bearing to ask.

2. **Spacing & layout adherence.** Check every gap/padding/margin resolves to a `--spacing-*`
   step (off-scale values like a stray `14px` are findings — distinct from `rule-audit`'s
   "is it a token at all"), the grid is consistent, and density suits the content. Cite
   `layout-composition`. Name the fix: the specific token to use.

3. **Type adherence.** Sizes resolve to the `--text-*` scale; body measure ≈ 45–75ch;
   line-height tightens with size; ≤ 2 families. Cite `typography-system`.

4. **Color role & harmony (mechanical where possible).** Colors are used by semantic role,
   not arbitrary tokens (a `danger` surface using the `info` token is a finding). Run
   `color-system/scripts/cvd-check.mjs` on the status/categorical/chart sets — a CVD collapse
   is a blocker. Use `design-tokens/scripts/contrast.mjs` only to *inform* a note; the pass/fail
   contrast verdict is `a11y-gate`'s. Cite `color-system`.

5. **Hierarchy & state craft (suggestion-first judgment).** One clear primary action per view;
   size/weight/space/contrast establish a scan path. The four states (Rule 4 owns *presence*)
   are *crafted*: the empty state guides (illustration + CTA), the skeleton matches the success
   layout, the error is actionable. Where this needs depth, defer to the `design-reviewer` agent.

6. **State the verdict and what was machine-checked.** Say explicitly which findings a script
   proved (`cvd-check`) versus judged, and that **accessibility conformance was not assessed —
   run `a11y-gate`.** Suggest each fix referencing the token/scale/role; the user applies and
   re-runs. A change is done only when all four gates are clean.

---

## Composes With
- **The 4th done-time gate** with `rule-audit`, `a11y-gate`, and `security-pass`; run together
  by `/gates`.
- **Consumes** the `design-reviewer` agent's craft report; **runs against** `vertical-slice` /
  `refactor` rendered output and the `design-tokens` `@theme` block.
- **Invokes** `color-system/scripts/cvd-check.mjs` and `design-tokens/scripts/contrast.mjs`
  (informational); it re-implements neither — readability is `a11y-gate`'s floor.
- **Defers to:** `a11y-gate` (contrast/WCAG), `rule-audit` (hardcoded values, Rule 3; state
  presence, Rule 4).

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project
> conventions): "review this dashboard card before merge — design-wise, ship or not?" given a
> snippet with `p-[18px]`, `gap-[14px]`, `marginBottom: 30`, hardcoded `#3b82f6`/`#22c55e`
> status colors, and bare `Loading...`/`No data` states. This is the **second weakest-justified**
> design skill: a capable base model reviews design well ad-hoc. A **boundary** failure was confirmed.

**Observed run.** The ad-hoc review was genuinely good — it caught the off-scale `p-[18px]`/
`gap-[14px]`, the inline `marginBottom: 30` margin leak, the weak value hierarchy, the
uncrafted bare states (and their CLS), the missing error state, and even currency formatting.
It did **not** do the one thing this gate exists to enforce:

```
"1. The text colors fail WCAG AA contrast … ≈3.7:1 … fails the 4.5:1 floor"   ← led with this
```

It **bundled accessibility conformance into the design verdict** — leading with contrast ratios
and WCAG as the headline blockers — rather than **deferring** contrast to `a11y-gate` and
separating *craft / system-adherence* from *conformance*. And with no repeatable checklist or
defer-map, coverage is **run-dependent**: this run was thorough; nothing guarantees the next
catches role-misuse or runs a CVD check.

**Failure class (confirmed, boundary-shaped).** Not "can't review design" — "reviews design and
a11y as one undifferentiated blob, inconsistently." The base model has no stable separation
between the four gates and no guaranteed coverage, so the same review re-run drifts. This skill's
value is the **systematic, repeatable adherence + craft pass with an explicit defer-map**
(contrast → `a11y-gate`, hardcoding → `rule-audit`), not a claim the model is blind to design.
**If a second capture shows the ad-hoc review stays this strong, consider folding this gate into
the `design-reviewer` agent + `/gates` rather than a standalone skill** — record that call in
`DECISIONS.md`.

---

## Examples
**Input:** "design gate on the new billing dashboard before merge."
**Output:** Reads the routes + `@theme` → flags `gap-[14px]` on the summary cards (use
`--spacing-2` = 16px), the KPI numbers at an off-scale `28px` (use `--text-2xl`), and runs
`cvd-check.mjs` on the 5-series chart palette → two series collapse under deuteranopia (blocker:
spread their lightness or add direct labels). Notes the empty state is a bare string — suggest
an illustration + "Connect a payment source" CTA. Verdict: not done; 1 blocker (CVD), 3 fixes;
"contrast/a11y not assessed — run a11y-gate."

**Input:** "is the settings page on the design system?"
**Output:** Spacing and type adhere; one finding — the destructive "Delete account" button uses
the `accent` token, not `danger` (role misuse) → switch to `danger`. cvd-check n/a (no
multi-color set). Verdict: done after the one fix.

---

## Edge Cases
- **No rendered environment** → audit statically from the JSX + `@theme`; flag that the visual
  hierarchy/density judgment is reduced without a render.
- **A deliberate off-scale value** (a 1px hairline, an optical nudge) → allow it, but require it
  be a named token or a documented exception, not an inline magic number.
- **Findings are subjective craft, not adherence** → hand to the `design-reviewer` agent rather
  than blocking the gate on taste; the gate blocks on system *adherence* and CVD, suggests on craft.
- **cvd-check flags a pair that carries a redundant label/icon already** → downgrade from blocker
  to note; color isn't the sole encoding there.

---

## References
- `references/checklist.md` — the done-time adherence + craft checklist (spacing, type, color
  role, hierarchy, state craft), with the explicit defer-to lines for each adjacent gate.

## Scripts
- `scripts/README.md` — the gate owns no script of its own; it *invokes* `cvd-check.mjs`
  (color-system) and `contrast.mjs` (design-tokens, informational). Documents how to run them
  against a change and how to read the exit codes.
