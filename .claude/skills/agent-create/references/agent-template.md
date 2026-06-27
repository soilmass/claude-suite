# Agent template + tool presets

Copy into `agents/<slug>.md`. Replace every `<…>`.

```markdown
---
name: <slug>
description: >
  <when to spawn this agent, as a trigger surface. Use when: "...".>
tools: <preset — see below>
model: <omit to inherit; or sonnet | haiku | opus>
---

You are <role>. <One-paragraph charter: the single job this agent owns.>

## Operating rules
- Cite and obey the nine inviolable rules in the project CLAUDE.md; never restate them.
- <2–5 rules specific to this job.>

## Procedure
1. <step>
2. <step>

## Output
<Exact shape of the final message — it IS the return value. e.g. "A severity-ranked list;
each item: `file:line — finding — why it violates Rule N — the concrete fix`. End with the
rules you checked.">

## Hands off to
- `<skill-or-agent-slug>` when <condition>.
```

## Tool presets (least-privilege)

| Agent kind | `tools` |
|---|---|
| Read-only reviewer / auditor / hunter | `Read, Grep, Glob` |
| Researcher (needs the web) | `Read, Grep, Glob, WebSearch, WebFetch` |
| Build-error resolver (runs builds, edits) | `Read, Grep, Glob, Bash, Edit, Write` |
| Executor (applies an approved plan) | `Read, Grep, Glob, Edit, Write, Bash` |
| Planner (read + think, no writes) | `Read, Grep, Glob` |

Omit the `tools` line entirely only when the agent genuinely needs every tool — rare, and a
smell for a reviewer/researcher. Never give a reviewer `Write`/`Edit`.
