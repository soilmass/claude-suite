---
name: a11y-gate
description: >
  Run axe against rendered output and interpret results against the WCAG 2.2 AA floor,
  naming the concrete fix for each finding and flagging the manual-review items axe
  cannot detect (meaningful alt text, logical reading order, keyboard flows).
  Use when: "check accessibility", "a11y pass", "is this accessible", "run axe", "WCAG
  check", "screen-reader review".
  Do NOT use for: the non-a11y inviolable rules (use rule-audit), security (use
  security-pass), or performance (CI budget).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. One of the four done-time gates. Partly wraps axe (a script) with
    judgment. Baseline observed (clean-room capture).
---

# a11y-gate

A done-time gate, sibling to `rule-audit` and `security-pass`. Suggestion-first like its
siblings: no interrogation — it runs axe and reads the output — but it names the specific
fix for each finding and, crucially, distinguishes what axe *can* catch from what it
*can't*, so "axe passed" is never mistaken for "accessible."

The WCAG 2.2 AA floor is set in `../../CLAUDE.md`.

---

## When to Use
- Rendered UI is finished and headed for done; one of the four done-time gates.
- The user asks whether something is accessible.

## When NOT to Use
- Non-a11y rules → `rule-audit`. Security → `security-pass`.

---

## Procedure

1. **No interrogation — run axe.** Point axe at the rendered routes/components. The input
   is the rendered output; there's nothing load-bearing to ask.

2. **Interpret against WCAG 2.2 AA, name fixes (suggestion-first).** For each machine
   finding, give the specific fix: the missing `aria-label`, the form control without a
   `<label>`, the contrast pair that fails, the focus-order problem. Not a bare flag — the
   fix.

3. **Flag the manual-review items axe CANNOT catch (completeness check).** State, every
   time, the things that pass axe but still fail real users: meaningful alt text (vs
   present-but-useless), logical reading/tab order, keyboard operability of custom
   interactions, focus visibility and management in dialogs/menus, error messages tied to
   fields. See `references/manual-checks.md`. This is what keeps "axe passed" honest.

4. **State the level checked.** Say explicitly: "axe clean at WCAG 2.2 AA for machine-
   detectable rules; the following manual items still need a human pass: …" — so coverage
   is never overstated.

5. **Suggest, don't silently fix.** Offer the concrete remediation for each item; the user
   applies. Many a11y fixes are token/markup changes that should re-run the gate after.

---

## Composes With
- **One of the four done-time gates** with `rule-audit`, `security-pass`, and `design-gate`
  (which owns design-system adherence + craft, distinct from this gate's WCAG floor).
- **Runs against** `vertical-slice`/`refactor` rendered output. Custom interactive
  behavior should already be shadcn/Radix (which carries a11y) per `CLAUDE.md` — this
  gate catches where that discipline slipped.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project conventions). The encoded failure class was confirmed.

**Observed run.** A naive reviewer shown a planted-flaw artifact correctly caught the
markup-level defects axe-style scanning surfaces — the clickable `<div>` with no role,
tabindex, or keyboard handler; the `<img>` with no alt; the unlabeled `<input>`; and the
low-contrast hardcoded `text-[#777]` — and returned a "not accessible" verdict.

```html
<div onClick={openMenu}>Menu</div>
<img src="/u/avatar-7f3.png" />
<input value={name} onChange={...} />
<span className="text-[#777]">Saved automatically</span>
```

But the review stopped at what is statically detectable: it never named the manual WCAG
items axe cannot see — whether the `<div>`-turned-button actually sits in a logical
**focus/tab order** and is operable by a full **keyboard flow**, or whether any alt text
that gets added is **meaningful** rather than merely present. Catching "div should be a
button" is not the same as verifying the resulting interaction works for an AT user.

**Failure class (confirmed).** A reviewer without this skill conflates "found the
machine-detectable defects" with "accessible," and reports a verdict that silently omits
the human-judgment layer — reading order, end-to-end keyboard operability, meaningful alt
and announced errors. This skill closes that gap by mandating the manual-review list every
time, so "axe-clean" is never overstated as "accessible."

---

## Examples
**Input:** "a11y pass on the new settings form."
**Output:** Runs axe → reports `[AA 1.4.3] contrast 3.1:1 on the helper text — raise to
the muted-strong token (4.6:1)`, `[AA 4.1.2] the toggle has no accessible name — add
aria-label` → then the manual list: "axe can't verify the tab order through the form is
logical, that the inline error is announced, or that the custom dropdown traps focus —
check these by keyboard." States: AA machine-clean after the two fixes; manual items open.

---

## Edge Cases
- **No rendered environment to run axe against** → walk the manual checklist by reading
  the markup; flag that machine coverage didn't run.
- **axe reports zero issues** → do NOT report "accessible"; report "axe-clean" and hand
  over the manual list. The gap is the whole point.
- **A finding is a false positive** (axe flags a valid pattern) → say so, don't make a
  pointless change.

---

## References
- `references/manual-checks.md` — the WCAG 2.2 AA items axe cannot detect, as a keyboard-
  and-screen-reader checklist.

## Scripts
- `scripts/README.md` — how to run axe against rendered routes (axe-core / Playwright) in
  this edge/App-Router setup; the script itself is environment-specific and noted there.
