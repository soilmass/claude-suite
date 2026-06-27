# Command templates

Copy into `commands/<slug>.md`. The body is a **prompt the model runs**, not code.

## Thin command (invokes one skill)

```markdown
---
description: <one line shown in the command list>
argument-hint: "[feature description]"
---

Invoke the `<skill-slug>` skill to handle: $ARGUMENTS

Report the skill's self-audit / output verbatim.
```

## Orchestrator (sequences several primitives)

```markdown
---
description: Run all three definition-of-done gates on a path
argument-hint: "[path or diff]"
allowed-tools: Bash(node:*), Read, Grep, Glob
---

Run the done-time gate trio on: $ARGUMENTS

1. Invoke `rule-audit` (run its scan.mjs, then the judgment pass).
2. Invoke `a11y-gate`.
3. Invoke `security-pass`.

Run all three even if an earlier one finds issues. Report findings grouped by gate, each
ranked by severity. Do not auto-fix.
```

## Patterns
- `$ARGUMENTS` = everything after the command. `$1`, `$2` = positional args.
- `@path/to/file` in the body pulls that file into context.
- A `!` `shell command` `` line runs before the prompt and injects its output — use sparingly
  and only with a matching `allowed-tools` entry.
- Omit `allowed-tools` for pure-prompt commands (most thin ones). Add it, least-privilege,
  only when the command itself runs tools.
- **Name the skill; never paste its steps.** The skill owns the procedure.
