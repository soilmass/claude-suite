---
name: suite-audit
description: >
  Lint the whole claude-suite for structural and coherence problems — skill/agent/command
  frontmatter, the section contract, least-privilege tools, dead cross-references between
  primitives, and duplicate triggers — and regenerate the composition map. So 100+ primitives
  stay one coherent system instead of rotting as the suite grows.
  Use when: "audit the suite", "lint the skills", "check the suite for drift", "regenerate the
  composition map", "are the primitives consistent".
  Do NOT use for: auditing application code against the nine rules (use rule-audit), authoring a
  new primitive (use skill-create / agent-create / command-create / hook-create).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. The suite's self-maintenance gate; reuses skill-create's lint-skill.mjs
    and adds agent/command/cross-reference/duplicate-trigger checks plus composition-map
    regeneration. Baseline section is the encoded failure class; replace with an observed transcript.
---

# suite-audit

The suite's self-maintenance gate. A distribution of 100+ primitives drifts silently: a skill
renamed but still referenced by its old slug, a reviewer agent quietly granted `Write`, two
skills claiming the same trigger phrase, a `## Output` section dropped. This skill runs the
mechanical audit that catches those, and regenerates `docs/composition-map.md` so the map never
lies about what exists.

It enforces the contract defined in `../../docs/house-style.md` and obeys `../../CLAUDE.md`.

---

## When to Use

- After generating or editing a batch of primitives (e.g. after a generation Workflow).
- Periodically, to catch cross-reference rot as primitives are renamed or removed.
- Before publishing the suite, as the definition-of-done for the distribution itself.

## When NOT to Use

- Auditing application code against the nine rules → `rule-audit`.
- Authoring a primitive → `skill-create`, `agent-create`, `command-create`, `hook-create`.
- Capturing a real failure baseline for a skill → `baseline-capture`.

---

## Procedure

1. **Run the mechanical audit (suggestion-first, no interrogation).** `node
   scripts/audit.mjs <suite-root>`. It lints every skill (via skill-create's `lint-skill.mjs`),
   validates agent and command frontmatter and least-privilege, flags dead cross-references and
   duplicate triggers. See `references/checks.md` for the full list.
2. **Triage structural findings first.** Exit code = structural findings (malformed
   frontmatter, missing sections, a reviewer with write access). These are breakages — fix them
   before anything else.
3. **Review the warnings.** Dead references and duplicate triggers are judgment calls: a "dead"
   reference may be a foundation slug (add it to the allowlist) or a real typo (fix it); a
   duplicate trigger may be intentional overlap (narrow one description) or a genuine collision.
4. **Regenerate the composition map.** Re-run with `--write` to rewrite
   `../../docs/composition-map.md` from the current primitives. Never hand-edit that file — it is
   generated.
5. **Report, don't silently fix.** List findings ranked structural-then-warning, each with the
   file and the fix. Apply fixes only when asked; record any slug-allowlist change in
   `DECISIONS.md`.

---

## Composes With

- **Runs against:** every `skills/`, `agents/`, `commands/` primitive in the suite.
- **Consumes:** `skill-create` (reuses its `lint-skill.mjs`) and `../../docs/house-style.md`.
- **Pairs with:** the four meta-skills — they author, this verifies.
- **Hands off:** a malformed skill → fix per `skill-create`; a real baseline gap → `baseline-capture`.

---

## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)

> Encoded failure class per the suite's design; replace with a real transcript.

**Failure class encoded:** Without a suite-wide audit, the distribution rots invisibly: a skill
renamed to `n1-hunter` while three siblings still point to `nplus1-hunter` (hand-offs that go
nowhere), a `code-review` agent shipped with `Write` in its tools (a "review" that edits the
tree), `vertical-slice` and a new skill both claiming the trigger `"build the feature"` (so
neither triggers reliably), an agent missing its `## Output` section (so it returns prose
instead of a finding list), and a `composition-map.md` that still lists deleted primitives —
each invisible until a user hits it.

---

## Examples

**Input:** "Audit the suite after the generation run."
**Output:** Runs `audit.mjs`, reports "62 skills, 16 agents, 25 commands; 0 structural findings;
4 warnings: duplicate trigger "review the diff" (code-review, rule-audit) — narrow one;
agent `pr-describer` references unknown slug `changelog` — should be `changelog-from-commits`."
Then offers to regenerate the composition map.

**Input:** "Regenerate the composition map."
**Output:** Runs `audit.mjs <root> --write`, rewrites `docs/composition-map.md` with the current
skills/agents/commands, and confirms the counts.

---

## Edge Cases

- **A "dead reference" is actually a foundation/external slug** → add it to the `FOUNDATION`
  allowlist in `audit.mjs`, don't rename the reference.
- **A duplicate trigger is intentional** → keep it but narrow the descriptions so the right skill
  wins; note the overlap.
- **The linter isn't found** → audit still runs agent/command/cross-ref checks; it reports the
  skipped skill lint as a warning.
- **User wants auto-fix** → it can apply the obvious fixes (rename a dead ref), but re-run the
  audit after; a fix can introduce a new finding.

---

## References

- `references/checks.md` — the full list of what `audit.mjs` checks, structural vs. warning, and
  the exit-code contract.

## Scripts

- `scripts/audit.mjs` — the suite-wide mechanical audit + composition-map regeneration. Exit
  code = structural findings (0 = sound). `--write` regenerates the map.
- `scripts/README.md` — usage, the structural-vs-warning split, and the foundation allowlist.
