# claude-suite hooks

Executable guards and reminders, wired in `../settings.json`. Hooks run **automatically** on
matching events — review each before enabling, as you would any code that runs on its own.
All are fast, make **no network calls**, and hold **no secrets**.

The contract: each hook reads the event JSON on **stdin**. **Exit 0** allows / no-ops;
**exit 2** blocks (only `PreToolUse`/`UserPromptSubmit` can block) with the reason + fix on
**stderr**. `PostToolUse`/`Stop`/`SessionStart` hooks are advisory and always exit 0.

| Hook | Event (matcher) | Blocks? | What it does |
|---|---|---|---|
| `pre-commit-gate.mjs` | PreToolUse (Bash) | yes | On `git commit`, runs rule-audit's `scan.mjs` on staged TS/JS; blocks on mechanical candidates. Not a substitute for the `/audit` judgment pass. |
| `protect-source-of-truth.mjs` | PreToolUse (Edit\|Write) | yes | Blocks silent edits to `CLAUDE.md` / `DECISIONS.md`; routes DECISIONS to the `decision-log` skill. Override markers: `SOURCE-OF-TRUTH-EDIT-ACK`, `DECISIONS-APPEND-ACK`. |
| `no-secrets-guard.mjs` | PreToolUse (Edit\|Write) | yes | Rule 9 backstop: blocks writes with secret-shaped `NEXT_PUBLIC_*`, credential literals, or `process.env.*` in `"use client"` files. |
| `drift-guard.mjs` | PostToolUse (Edit\|Write) | no | Warns on stack drift: Prisma, Pages-Router data fetching, `pages/`, `runtime: 'nodejs'`. |
| `skill-lint.mjs` | PostToolUse (Write) | no | When a `*/SKILL.md` is written, runs the structural linter on that skill dir. |
| `stop-gates-reminder.mjs` | Stop | no | If TS files changed and aren't gated, reminds to run `/gates`. |
| `session-context.mjs` | SessionStart | no | Prints the newest `DECISIONS.md` entries at session start. |
| `typecheck-on-touch.mjs` | (unwired) | no | **OFF by default** — opt-in full `tsc --noEmit` after each edit; too slow for most repos. Kill switch: `SUITE_TYPECHECK_ON_TOUCH=0`. |

## Install
Copy this `hooks/` directory to `.claude/hooks/` and merge `../settings.json` into your
`.claude/settings.json`. The permissions allowlist there lets the hook scripts run without
prompting. Restart the session so `SessionStart` fires.

## Adjusting
- Disable a hook: remove its entry from `settings.json` (the script can stay on disk).
- Tighten a matcher: edit the `matcher` field (a tool name or regex over tool names).
- Add a hook: author it with the `hook-create` skill, which writes to this contract.
