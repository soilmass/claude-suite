# Hook events, contract, and settings.json wiring

## Events
| Event | Fires | Can block? |
|---|---|---|
| `PreToolUse` | before a tool runs | yes (exit 2 / JSON decision) |
| `PostToolUse` | after a tool returns | no (reacts/annotates) |
| `UserPromptSubmit` | when the user submits a prompt | yes |
| `Stop` | when the agent finishes a turn | no (advisory) |
| `SessionStart` | at session start | no (inject context) |
| `SubagentStop` | when a subagent finishes | no |

## The script contract
- Event JSON arrives on **stdin** (tool name, tool input, cwd, etc.).
- **Exit 0** = allow / no-op. **Exit 2** = block; **stderr** is shown to the user — put the
  reason and the fix there. Other non-zero = non-blocking error (avoid; it's a silent failure).
- Optionally emit JSON on **stdout** for structured decisions
  (`{"decision":"block","reason":"…"}`) where supported.
- Fast, synchronous, **no network**, no secrets.

## Script skeleton
```js
#!/usr/bin/env node
// <name> — <guard>. Wired under hooks.<Event> in settings.json.
import { readFileSync } from "node:fs";
const event = JSON.parse(readFileSync(0, "utf8"));   // fd 0 = stdin
// ... fast check on event.tool_input / event.tool_name ...
if (violation) {
  process.stderr.write("Blocked: <what> — <rule> — <fix>\n");
  process.exit(2);
}
process.exit(0);
```

## settings.json wiring
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "node .claude/hooks/pre-commit-gate.mjs" }
        ]
      }
    ],
    "SessionStart": [
      { "hooks": [ { "type": "command", "command": "node .claude/hooks/session-context.mjs" } ] }
    ]
  },
  "permissions": {
    "allow": ["Bash(node .claude/hooks/*)", "Bash(node *scan.mjs*)"]
  }
}
```

- `matcher` is a tool name (e.g. `Bash`, `Write`, `Edit`) or a regex over it. For Bash, gate
  on the command inside the hook (parse `event.tool_input.command`), since the matcher only
  sees the tool name.
- Add every script a hook runs to `permissions.allow` so it doesn't prompt mid-session.
- Paths are relative to the project root once installed into `.claude/`.
