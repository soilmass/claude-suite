---
name: skill-create
description: >
  Author a new skill in this suite's exact house style — frontmatter, the ten-section body,
  references/ and scripts/ layout — wired to the project CLAUDE.md and composing with the
  existing primitives, so the suite stays one coherent system as it grows.
  Use when: "create a skill", "new skill for X", "add a skill", "scaffold a skill",
  "author a SKILL.md", "make X a skill".
  Do NOT use for: authoring a subagent (use agent-create), a slash command (use
  command-create), a hook (use hook-create), or deciding whether something should be a flat
  rule instead of a skill (that belongs in CLAUDE.md, not here).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. The self-growing core of the suite: encodes the house style so new
    skills don't drift. Baseline observed (clean-room capture).
---

# skill-create

The self-growing core. A suite of 100+ primitives only stays coherent if every new one is
authored to the same contract; this skill is that contract made executable. It takes a
capability ("I keep doing X by hand") and produces a complete, house-style skill directory
that composes with the rest.

The house style is defined in `../../docs/house-style.md` and the spine/rules in
`../../CLAUDE.md`. This skill obeys both and does not restate them.

---

## Non-Negotiable Rules

These exist because a malformed skill silently fails to trigger or drifts from the suite:

- **Never invent a new section order or frontmatter shape.** The ten-section body and the
  minimal frontmatter (`name`, `description`, `license`, `metadata`) are fixed. A skill with
  `allowed-tools` or `model` on it, or with sections out of order, is wrong.
- **Never write a skill for a flat decision.** If the thing has no repeatable, failure-prone
  procedure — if it's "just a rule" — it belongs in `CLAUDE.md`, not a skill. Refuse to
  manufacture a procedure where none exists.
- **Never ship a skill without an honest baseline.** Write the `Baseline failure (REPLACE
  WITH OBSERVED TRANSCRIPT)` section as the failure *class*, labeled as a placeholder. A
  skill written from an imagined baseline fixes an imagined problem.
- **Never duplicate a rule or a sibling's job.** Point to `CLAUDE.md` for rules and name the
  sibling skill in `Do NOT use for:` and `Composes With`.

Refuse these rationalizations: "I'll skip the references and put it all in the body"; "this
flat rule is close enough to a procedure"; "I'll write a real baseline later, ship the empty
one"; "two skills doing similar things is fine."

---

## When to Use

- A repeatable, failure-prone task recurs and no existing skill covers it.
- An existing capability needs to be captured so the whole team/agent fleet does it the same.

## When NOT to Use

- Subagent → `agent-create`. Slash command → `command-create`. Hook → `hook-create`.
- The thing is a one-time task or a flat decision → it's a `CLAUDE.md` rule or just do it.
- An existing skill nearly covers it → extend that skill instead of forking a near-duplicate.

---

## Procedure

1. **Confirm it deserves to be a skill (low-interrogation, but this gate is firm).** Ask: is
   this repeatable, failure-prone, and not already owned by a sibling or a flat rule? If it's
   a decision, route it to `CLAUDE.md`. If a sibling nearly covers it, propose extending that
   sibling. See `references/is-it-a-skill.md`.
2. **Name it.** Kebab-case, verb-noun or term-of-art (`schema-design`, `n1-hunter`). Check it
   does not collide with an existing slug under `skills/`.
3. **Write the description as the trigger surface.** 3–5 sentences, then `Use when:` with
   present-tense user utterances, then `Do NOT use for:` naming the sibling that owns each
   excluded case. This is the only part loaded at startup — it must earn the trigger.
4. **Draft the body in the fixed ten-section order** per `../../docs/house-style.md`. Include
   `Non-Negotiable Rules` only if the failure is baked into generated output. Each Procedure
   step ends in "see `references/X.md`" or "record in `DECISIONS.md`".
5. **Move bulk to `references/`.** Code patterns, checklists, long examples → one `.md` per
   topic, each with a one-line purpose on line 1. Keep `SKILL.md` ~110–196 lines.
6. **Add a script only if a mechanical check exists.** If part of the skill is regex- or
   tool-detectable, add `scripts/<verb>.mjs` + `scripts/README.md` (usage, limits, exit
   code). Otherwise leave `scripts/.gitkeep` and say what signal would justify one.
7. **Write the honest baseline + lint.** Fill `Baseline failure` as the failure class with
   the verbatim placeholder heading. Run `scripts/lint-skill.mjs <dir>` and fix every finding
   before declaring done. If you resolved a fork, record it in `DECISIONS.md`.

---

## Composes With

- **Feeds:** every skill in the suite — this is how they're born. `suite-audit` then verifies
  what this produces.
- **Pairs with:** `agent-create`, `command-create`, `hook-create` — the four meta-skills.
- **Hands off:** subagent → `agent-create`; command → `command-create`; hook → `hook-create`;
  "this is a rule, not a skill" → `CLAUDE.md` (and `decision-log` if it's a fork).
- **Runs against:** `../../docs/house-style.md` as its spec.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project
> conventions). The encoded failure class was confirmed.

**Observed run.** Asked to author a skill for edge-compatible tRPC rate limiting, the naive
agent produced a working `SKILL.md` that ignored every house-style contract: the frontmatter
had no `Use when:` / `Do NOT use for:` trigger surface, the body used ad-hoc headings instead
of the fixed ten-section order, nothing was factored into `references/`, there was no baseline
section, and it never deferred to `CLAUDE.md` or composed with obvious siblings
(`trpc-middleware`, `env-validation`, `neon-turso-driver`). The frontmatter it emitted:

```yaml
---
name: rate-limit-trpc
description: How to add rate limiting to tRPC procedures on the edge runtime.
---
```

It also picked a vendor (Upstash) without recording it as a fork in `DECISIONS.md`, and read
`x-forwarded-for` and env vars without Zod-parsing them (Rule 8).

**Failure class (confirmed).** Free-formed from an imagined contract, the output looks like a
skill and loads, but it does not behave like one: an unparseable trigger surface so it never
selects reliably, a drifting body shape, rules and tool choices restated or chosen silently
instead of pointing at `CLAUDE.md`/`DECISIONS.md`, and no composition with the siblings that
already own half its job. This skill exists to make all of that mechanical.

---

## Examples

**Input:** "I keep hand-checking that our cursor pagination is stable. Make it a skill."
**Output:** Confirms it's repeatable + failure-prone (yes) → names it `pagination-cursor` →
writes the description with `Use when: "paginate the list", "add infinite scroll"` and
`Do NOT use for: offset pagination` → ten-section body, the keyset pattern moved to
`references/keyset.md` → no script (judgment task), `.gitkeep` with the signal noted →
honest baseline → lint clean.

**Input:** "Make 'always use Drizzle' a skill."
**Output:** Refuses to manufacture a procedure: "That's a flat decision with no repeatable
failing task — it belongs in `CLAUDE.md` as a spine rule, not a skill. Want me to confirm
it's recorded there and in `DECISIONS.md`?"

---

## Edge Cases

- **Capability overlaps an existing skill** → propose extending that skill; only fork if the
  trigger surfaces and procedures genuinely differ.
- **It's clearly an agent/command/hook** → hand to the matching meta-skill, don't force it
  into a SKILL.md.
- **No mechanical check possible** → that's fine; most skills have no script. Don't invent a
  pointless one.
- **User wants it shipped without a baseline** → write the labeled placeholder anyway and say
  it's unevaluated until a real transcript replaces it.

---

## References

- `references/is-it-a-skill.md` — the decision gate: skill vs. flat rule vs. agent/command/hook.
- `references/skill-template.md` — the fill-in-the-blanks ten-section template.

## Scripts

- `scripts/lint-skill.mjs` — validates a skill directory: frontmatter fields present,
  `Use when:`/`Do NOT use for:` in the description, the ten section headings present and in
  order, `source_of_truth` resolvable, the baseline placeholder heading intact.
- `scripts/README.md` — usage and the explicit list of what it checks (exit code = findings).
