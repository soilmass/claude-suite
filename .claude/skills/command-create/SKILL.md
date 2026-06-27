---
name: command-create
description: >
  Author a new slash command in this suite's house style: a thin entry point or orchestrator
  whose body is a prompt (not code), with an argument hint, an optional least-privilege
  allowed-tools, and an explicit reference to the skill it invokes — so keystroke triggers
  stay predictable and don't reimplement skill logic.
  Use when: "create a command", "new slash command", "add a /X command", "make a shortcut
  for", "wire up a command".
  Do NOT use for: the procedure itself (use skill-create), a delegated worker (use
  agent-create), an automatic per-event guard (use hook-create).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the thin-command contract: invoke skills, don't reimplement
    them. Baseline section is the encoded failure class; replace with an observed transcript.
---

# command-create

Slash commands are the keystroke surface — `/slice`, `/gates`, `/research`. The discipline
that keeps them useful: a command is **thin**. Its body is a prompt that invokes a skill or
sequences a few; it does not re-encode the skill's procedure, because then the two drift.

Command frontmatter and body shape are defined in `../../docs/house-style.md §3`; the
spine/rules in `../../CLAUDE.md`.

---

## Non-Negotiable Rules

- **Never reimplement a skill's logic in a command body.** The command invokes the skill by
  name; the skill owns the procedure. Two copies drift.
- **Never grant broad `allowed-tools` to a command that only needs one.** A command that runs
  one script gets `allowed-tools: Bash(node:*)`, not unrestricted Bash.
- **Always make the argument contract explicit.** Use `$ARGUMENTS` / `$1` and an
  `argument-hint`; a command that silently ignores its args is a trap.

Refuse: "I'll paste the skill's steps into the command so it's self-contained"; "give it all
tools, simpler"; "args are obvious."

---

## When to Use

- A skill or sequence is run often enough to deserve a keystroke (`/audit`, `/gates`).
- You want an orchestrator that fires several primitives in a fixed order.

## When NOT to Use

- The behavior is the procedure → `skill-create` (then a command can invoke it).
- It's a delegated worker → `agent-create`.
- It's an automatic guard → `hook-create`.

---

## Procedure

1. **Decide thin vs. orchestrator (low-interrogation).** A thin command invokes one skill; an
   orchestrator sequences several (and says the order explicitly). See
   `references/command-template.md`.
2. **Name it** by the slash it'll be typed as (`audit` → `/audit`); avoid collisions with
   built-ins and existing commands.
3. **Write the `description` and `argument-hint`.** One line each; the description shows in the
   command list.
4. **Set least-privilege `allowed-tools`** only if the command runs tools directly; otherwise
   omit and let it be a pure prompt.
5. **Write the body as a prompt** that names the skill(s) to invoke and threads `$ARGUMENTS`.
   For orchestrators, list the sequence and the stop-on-failure behavior.
6. **Validate with `suite-audit`** and record any fork in `DECISIONS.md`.

---

## Composes With

- **Feeds:** the `commands/` directory.
- **Pairs with:** `skill-create` (commands are the keystroke surface for skills),
  `agent-create` (commands often spawn agents).
- **Hands off:** "this is the procedure" → `skill-create`; "this should run automatically" →
  `hook-create`.
- **Runs against:** `../../docs/house-style.md §3`.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project
> conventions). The encoded failure class was confirmed.

**Observed run.** Asked to add a `/gates` command, the naive agent wrote a body that
re-lists each gate's procedure inline — the nine rules copied from memory, grep snippets,
and the axe/`pnpm audit` invocations — instead of invoking the existing `rule-audit`,
`a11y-gate`, and `security-pass` skills. The frontmatter carried only a `description`, it
never looked at sibling commands, and the result contract was hand-waved ("Exit non-zero
feel"):

```markdown
## 1. Rule audit (the nine inviolable rules)
...
rg -n ': any|@ts-ignore|as any' src/
rg -n '#[0-9a-fA-F]{3,6}|\[[0-9]+px\]' src/
...
Exit non-zero feel (report FAIL overall) if any gate failed.
```

**Failure class (confirmed).** Left to its own devices, the agent reimplements the skills a
command should merely invoke — duplicating the nine rules and gate steps that drift the
moment a canonical skill changes — guesses at frontmatter shape, and leaves a vague result
contract. This skill forces a thin body that names the skills, a house-style frontmatter, and
an explicit pass/fail contract.

---

## Examples

**Input:** "Make a /slice command."
**Output:** `description: Build a type-safe feature slice`, `argument-hint: "[feature
description]"`, no `allowed-tools` (pure prompt). Body: "Invoke the `vertical-slice` skill to
build: $ARGUMENTS. Then report the self-audit." Thin — the skill owns the procedure.

**Input:** "Make a /gates command that runs all three gates."
**Output:** An orchestrator: body sequences `rule-audit` → `a11y-gate` → `security-pass` on
`$ARGUMENTS`, states "run all three even if one finds issues; report findings grouped by
gate," and names each skill rather than inlining its steps.

---

## Edge Cases

- **Command needs to do real work itself** → it probably wants a skill or agent behind it;
  keep the command thin and delegate.
- **Multiple commands would invoke the same skill differently** → that's fine if the args
  differ meaningfully; otherwise one command with an arg.
- **Name collides with a built-in** → pick another; built-ins win.

---

## References

- `references/command-template.md` — the frontmatter + thin-body and orchestrator-body
  templates, with the `$ARGUMENTS` and `allowed-tools` patterns.

## Scripts

`scripts/` reserved. Structural validation of `commands/*.md` (description present,
thin-body check, args usage) is centralized in `suite-audit`.
