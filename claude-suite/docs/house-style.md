# House style — the authoring contract for `claude-suite`

Every primitive in this suite follows this contract so 100+ of them behave as one coherent
system instead of drifting apart. This file is the single reference for `skill-create`,
`agent-create`, `command-create`, and `hook-create`, and for any human or agent authoring a
new primitive. It codifies the exact format already established by the foundation skills
(`vertical-slice`, `rule-audit`, etc.).

---

## 1. SKILL.md

### Frontmatter (YAML) — minimal, exact

```yaml
---
name: <kebab-case-slug>            # matches the directory name
description: >
  <3–5 sentences: what the skill does, written as the trigger surface.>
  Use when: "<trigger phrase>", "<trigger phrase>", "<trigger phrase>".
  Do NOT use for: <anti-trigger naming the sibling skill that owns it>.
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. <what failure class it encodes; any stack retargeting>.
    Baseline section is the encoded failure class; replace with an observed transcript.
---
```

Rules:
- **No** `allowed-tools`, `model`, or `disable-model-invocation` on skills. Skills don't
  restrict tools or override the model.
- `description` is the **only** trigger surface loaded at startup — it must carry the
  `Use when:` phrases (present-tense user utterances, no "help me") and a `Do NOT use for:`
  that names the sibling that owns the excluded case.
- `source_of_truth: ../../CLAUDE.md` is canonical on every skill.

### Body — sections in this exact order

1. **`# <name>` + 1–3 sentence pitch.** State the skill's niche and the failure class it
   solves. Reference `../../CLAUDE.md` for the spine/rules; do not restate them.
2. **`## Non-Negotiable Rules`** *(optional — only when the failure is baked into generated
   code).* 3–4 rules framed as "Never X." End with a "Refuse these rationalizations: …" line
   listing the exact excuses that produce the failure.
3. **`## When to Use` / `## When NOT to Use`.** Concise bullets. Every "NOT" bullet names the
   sibling skill that owns that case.
4. **`## Procedure`.** 5–8 numbered steps. Each step: **bold header** (with interrogation
   level where relevant: low/medium/high), a why, and a pointer — "see `references/X.md`" or
   "record in `DECISIONS.md`". Calibrate interrogation by **cost of being wrong**, not task
   size.
5. **`## Composes With`.** Some of: **Consumes:** / **Feeds:** / **Runs against:** /
   **Pairs with:** / **Hands off:** — each naming sibling primitives by slug.
6. **`## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)`.** A blockquote noting it is
   the encoded failure *class*, not a captured transcript, then **`Failure class encoded:`**
   listing 3–5 concrete, specific defects that ship without the skill. Keep the heading text
   verbatim including the parenthetical — the audit greps for it.
7. **`## Examples`.** 2–3 `**Input:**` → `**Output:**` walkthroughs, concrete.
8. **`## Edge Cases`.** 3–4 "when X → do Y instead" items.
9. **`## References`.** Bullet per `references/*.md`, each with a one-line purpose.
10. **`## Scripts`.** Describe each executable, or state "reserved / empty for now" with the
    signal that would justify adding one.

Length: ~110–196 lines. Bulk lives in `references/`, not the body.

### Directory layout

```
skills/<slug>/
├── SKILL.md
├── references/            # one .md per major topic; first line states its purpose
│   └── <topic>.md
├── scripts/              # executables (.mjs/.sh) + README.md; or a .gitkeep if reserved
│   └── README.md
└── assets/.gitkeep       # reserved
```

Scripts that earn their place document usage + limits + exit code in a `scripts/README.md`
(exit code convention: number of findings; 0 ≠ "clean" when a judgment pass remains).

---

## 2. agents/<slug>.md (subagents)

```yaml
---
name: <kebab-case-slug>
description: >
  <when this subagent should be spawned, as a trigger surface. Use when: "...".>
tools: Read, Grep, Glob, Bash          # least-privilege; omit to inherit all
model: sonnet                          # optional; omit to inherit the session model
---

You are <role>. <One-paragraph charter.>

## Operating rules
- Cite and obey the nine inviolable rules in the project CLAUDE.md; never restate them.
- <2–5 focused rules for this agent's job.>

## Procedure
1. ...

## Output
<exact shape the agent returns — a ranked list, a patch, a report.>

## Hands off to
- <skill or agent slug> when <condition>.
```

Agents are the autonomous, multi-step counterpart to a skill. Where a skill is a procedure
the main loop follows, an agent is a procedure delegated to a fresh context. Keep `tools`
least-privilege (read-only reviewers get `Read, Grep, Glob`; never give a reviewer `Write`).

---

## 3. commands/<slug>.md (slash commands)

```yaml
---
description: <one line shown in the command list>
argument-hint: "[target]"             # optional
allowed-tools: Bash(node:*), Read     # optional; restricts what the command may call
---

<The prompt body. Use $ARGUMENTS or $1, $2 for args. Reference the skill it invokes.>
```

Commands are **thin**: most invoke a skill or orchestrate a few. A command's body is a prompt
the model runs, not code. Use `!` `command` `` lines for pre-run context injection sparingly,
and `@path` to pull a file in. Keep orchestration commands (`/gates`) explicit about the
sequence they run.

---

## 4. hooks (hooks/<name>.mjs + settings.json)

Hooks are executable scripts wired in `settings.json` under `hooks.<EventName>`. Events:
`PreToolUse`, `PostToolUse`, `Stop`, `SessionStart`, `UserPromptSubmit`, etc. A hook reads a
JSON event on stdin and may emit JSON on stdout to allow/deny/annotate.

```js
#!/usr/bin/env node
// <name> — <what it guards>. Wired in settings.json under hooks.<Event>.
// Reads the hook event JSON on stdin; exit 0 = allow, exit 2 = block (stderr shown).
```

Hook discipline: fast (they run on every matching event), no network, no secrets, and a
`block` path that explains itself on stderr. Document each hook in `hooks/README.md`.

---

## 5. Cross-cutting conventions

- **Point to the rules, never restate them.** Say "Rule 2 (ownership)" and link
  `../../CLAUDE.md`. Duplicated rules drift.
- **Reference siblings by slug.** `vertical-slice`, `rule-audit` — the audit checks these
  resolve to real primitives.
- **Record forks in `DECISIONS.md`.** Any choice the project hadn't decided.
- **Honest baselines.** Ship the `Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)`
  placeholder; a skill written from an imagined baseline fixes an imagined problem.
- **Interrogation calibrated by cost of being wrong.** Scaffolds: low. Schema/destructive:
  high. Gates: suggestion-first.
