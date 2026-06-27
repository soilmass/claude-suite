# Skill template — fill in the blanks

Copy this into `skills/<slug>/SKILL.md` and replace every `<…>`. Keep the section order and
the verbatim baseline heading. Delete `Non-Negotiable Rules` only if the failure is NOT baked
into generated output.

```markdown
---
name: <slug>
description: >
  <3–5 sentences: what it does, as the trigger surface.>
  Use when: "<phrase>", "<phrase>", "<phrase>".
  Do NOT use for: <case> (use <sibling-slug>), <case> (use <sibling-slug>).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. <failure class it encodes; any retargeting>.
    Baseline section is the encoded failure class; replace with an observed transcript.
---

# <slug>

<1–3 sentence pitch: the niche and the failure class. Reference ../../CLAUDE.md for rules.>

---

## Non-Negotiable Rules

- **Never <X>.** <why — tied to an observed failure>.
- **Never <Y>.** <why>.

Refuse these rationalizations: "<excuse>"; "<excuse>".

---

## When to Use
- <case>

## When NOT to Use
- <case> → `<sibling-slug>`.

---

## Procedure

1. **<Action> (<low|medium|high>-interrogation).** <why>. See `references/<x>.md`.
2. **<Action>.** <why>. … record in `DECISIONS.md` if a fork is resolved.
…

---

## Composes With

- **Consumes:** `<slug>`.
- **Feeds:** `<slug>`.
- **Pairs with:** `<slug>`.
- **Hands off:** <condition> → `<slug>`.

---

## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)

> Encoded failure class; replace with a real run-without-the-skill transcript.

**Failure class encoded:** <3–5 concrete, specific defects that ship without this skill.>

---

## Examples

**Input:** "<user utterance>"
**Output:** <concise walkthrough>.

---

## Edge Cases

- **<situation>** → <what to do instead>.

---

## References

- `references/<x>.md` — <one-line purpose>.

## Scripts

- `scripts/<verb>.mjs` — <what it does>. / "reserved; <signal that would justify one>."
```
