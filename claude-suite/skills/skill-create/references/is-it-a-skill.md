# Is it a skill? — the decision gate

The first question `skill-create` answers. Most "make a skill for X" requests should NOT
become a skill. Route by these tests.

## It IS a skill when ALL of these hold
- **Repeatable.** The task recurs; you'll do it more than a handful of times.
- **Failure-prone.** Left to itself, the agent gets it subtly wrong in a way that compiles /
  looks fine but ships a defect. The skill encodes the avoidance.
- **Procedural.** There is a sequence of judgment-bearing steps, not a single fact.
- **Unowned.** No existing skill covers it; no flat `CLAUDE.md` rule already handles it.

## It is NOT a skill — route elsewhere
| If it's… | It belongs in… |
|---|---|
| A decided default ("use Drizzle", "edge runtime") | `CLAUDE.md` spine + `DECISIONS.md` |
| A one-line check a regex/CI does deterministically | a CI gate or a `scripts/` helper |
| A one-time task | just do it |
| An autonomous, delegate-to-fresh-context job | a subagent → `agent-create` |
| A keystroke entry point / orchestration trigger | a slash command → `command-create` |
| An automatic guard on every tool call / event | a hook → `hook-create` |
| Already ~covered by a sibling skill | extend that sibling, don't fork |

## The tell that it's a flat rule, not a skill
If you can state it as one imperative sentence with no branching ("money is integer minor
units"), it's a rule. If avoiding the failure requires *reading the situation and deciding*,
it's a skill.

## When two skills overlap
Compare trigger surfaces and procedures. If the `Use when:` phrases and the steps genuinely
differ, two skills are fine (each names the other in `Do NOT use for:`). If they'd mostly
duplicate, extend the existing one and widen its description instead.
