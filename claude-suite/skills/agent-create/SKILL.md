---
name: agent-create
description: >
  Author a new subagent (a delegated, fresh-context worker) in this suite's house style: a
  least-privilege tools list, a focused charter that obeys the nine rules, a clear output
  shape, and explicit hand-offs to skills. So delegated work behaves consistently instead of
  improvising.
  Use when: "create an agent", "new subagent for X", "add a reviewer agent", "make X a
  background agent", "scaffold an agent".
  Do NOT use for: a procedure the main loop follows inline (use skill-create), a keystroke
  entry point (use command-create), an automatic per-event guard (use hook-create).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the subagent contract: least-privilege tools, charter,
    output shape, hand-offs. Baseline section is the encoded failure class; replace with an
    observed transcript.
---

# agent-create

Subagents are procedures delegated to a fresh context — reviewers, resolvers, researchers,
planners. They earn their keep by keeping a big, noisy job (reading 40 files, hunting an N+1
across a router tree) out of the main context and returning only the conclusion. This skill
authors one to the suite's contract so its tools, charter, and output are predictable.

The agent frontmatter and body shape are defined in `../../docs/house-style.md §2`; the
spine/rules in `../../CLAUDE.md`. This skill obeys both.

---

## Non-Negotiable Rules

- **Never grant more tools than the job needs.** A reviewer gets `Read, Grep, Glob` — never
  `Write` or `Bash`. An executor that edits files says so and is scoped to it. Over-broad
  tools are how a "review" silently mutates the tree.
- **Never let the agent restate the nine rules.** It cites and obeys `CLAUDE.md`; the rules
  live in one place.
- **Never leave the output shape implicit.** State exactly what the agent returns (a ranked
  finding list, a unified diff, a structured report) — its final message IS the result, not
  a human-facing chat.

Refuse: "give it all tools to be safe"; "it'll figure out what to return"; "paste the rules
in so it remembers them."

---

## When to Use

- A multi-step job should run in its own context and report a conclusion (review, resolve,
  research, plan).
- You want the same delegated behavior every time, not ad-hoc subagent prompts.

## When NOT to Use

- It's a procedure the main loop should follow step-by-step → `skill-create`.
- It's a trigger/orchestration entry point → `command-create`.
- It's an automatic guard on tool calls/events → `hook-create`.

---

## Procedure

1. **Define the charter and boundary (medium-interrogation).** One sentence: what this agent
   is and the single job it owns. If it spans two jobs, split it. See
   `references/agent-template.md`.
2. **Choose least-privilege tools.** Read-only reviewers: `Read, Grep, Glob`. Resolvers that
   build: add `Bash`. Editors: add `Edit, Write` and say so. Omit `tools` only if it
   genuinely needs everything (rare).
3. **Pick the model deliberately or inherit.** Omit `model` to inherit the session model
   (usually right). Set it only when a cheaper/heavier tier clearly fits.
4. **Write the operating rules.** "Cite and obey the nine rules in CLAUDE.md" plus 2–5 rules
   specific to this agent's job. Do not restate the nine.
5. **Specify the exact output shape.** What the final message must contain and in what form,
   since that message is the return value the caller consumes.
6. **Wire hand-offs.** Name the skills/agents this one defers to and the condition. Record any
   fork in `DECISIONS.md`. Validate with `suite-audit`.

---

## Composes With

- **Feeds:** the `agents/` directory; callers spawn these via the Agent tool or `/`-commands.
- **Pairs with:** `skill-create` (most agents delegate to a skill's procedure),
  `command-create` (commands often spawn agents).
- **Hands off:** "this is an inline procedure" → `skill-create`; "this is a trigger" →
  `command-create`.
- **Runs against:** `../../docs/house-style.md §2`.

---

## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)

> Encoded failure class per the suite's design; replace with a real transcript.

**Failure class encoded:** Asked to "make a code-review agent," the agent writes a `.md` with
no `tools` field (so the reviewer can `Write` and silently edits files mid-review), a vague
charter that overlaps three other agents, the nine rules pasted inline (drifting from
`CLAUDE.md`), and no stated output shape — so it returns a chatty paragraph instead of a
ranked, located finding list the caller can act on.

---

## Examples

**Input:** "Make an agent that hunts N+1 access across our routers."
**Output:** Charter: "Find N+1 data access in tRPC routers and Drizzle calls." Tools:
`Read, Grep, Glob` (read-only). Operating rules cite Rule 7. Output: a ranked list of
`file:line — suspected N+1 — why — the relational-query fix`. Hands off the fix to `refactor`.

**Input:** "I want an agent to write our feature for me end to end."
**Output:** Notes that's the `vertical-slice` skill's job run by the main loop or a
`refactor-executor` agent; offers to create an executor agent scoped to applying an approved
plan, with `Edit, Write, Bash` and an explicit "apply only the approved plan" rule.

---

## Edge Cases

- **Agent would need write access to review** → it shouldn't; split review (read-only) from
  apply (a separate executor agent).
- **Charter spans multiple jobs** → split into focused agents; narrow charters return better.
- **It's really a one-shot prompt** → don't make an agent; just run it.

---

## References

- `references/agent-template.md` — the frontmatter + charter + output + hand-off template,
  with the least-privilege tool presets.

## Scripts

`scripts/` reserved. Structural validation of `agents/*.md` is centralized in `suite-audit`
(frontmatter, least-privilege check, output-shape presence) rather than duplicated here.
