# Evaluating & testing `claude-suite`

How to evaluate the suite and verify it actually works once you install it and reopen a
session. Read Part 1 for what is and isn't already proven, then run Part 3's phases and fill in
the scorecard.

---

## Part 1 — Honest evaluation: proven vs unproven

| Aspect | Status | How it was checked |
|---|---|---|
| Directory/frontmatter contract (every skill/agent/command) | ✅ proven | `suite-audit` → 0 structural findings |
| Section order, `Use when:`/`Do NOT use for:`, resolvable `source_of_truth` | ✅ proven | `lint-skill.mjs` across all 72 skills |
| Cross-references resolve; no duplicate triggers | ✅ proven | `suite-audit` → 0 warnings |
| **Technical accuracy of code/claims** in skill bodies | ✅ reviewed | adversarial review of all 67 generated skills; 29 fixed, re-linted |
| Hook scripts: parse, exit codes, block/allow logic | ✅ proven | stdin-simulated each hook |
| Lint/audit scripts run | ✅ proven | run against fixtures |
| **Skills actually TRIGGER on their phrases in a live session** | ❌ unproven | needs a loaded session — Phase 2 |
| **A triggered skill produces correct end-to-end output** | ⚠️ spot-checked only | needs running against a real app — Phase 7 |
| **No false triggers / wrong-skill collisions** in practice | ❌ unproven | Phase 2 |
| Hooks fire in a real session via `settings.json` | ⚠️ logic-tested, not session-tested | Phase 4 |
| Commands resolve and invoke their skills in-session | ❌ unproven | Phase 5 |
| Agents spawn with the right tools and return the stated output | ❌ unproven | Phase 6 |
| **Baselines are real (the building-skills "evaluated" bar)** | ❌ NOT met by design | every `Baseline failure` is a labeled placeholder — Phase 8 |

**Bottom line:** the suite is *structurally sound and technically reviewed* — usable as
opinionated procedures today. It is **not yet behaviorally evaluated**: nobody has confirmed in
a live session that the skills trigger when expected, don't trigger when not, and produce
correct output on a real codebase. Parts 3 closes that gap.

---

## Part 2 — Pre-flight: install & load

Install **project-scoped into this repo** (recommended for testing — the suite's skills
reference the 11 foundation skills, which already live in `.claude/skills/`, and the root
`CLAUDE.md` is the canonical source of truth the skills point at).

```sh
# from the repo root
mkdir -p .claude/skills .claude/agents .claude/commands .claude/hooks
cp -r claude-suite/skills/*   .claude/skills/
cp -r claude-suite/agents/*   .claude/agents/
cp -r claude-suite/commands/* .claude/commands/
cp -r claude-suite/hooks/*    .claude/hooks/
# DO NOT copy claude-suite/CLAUDE.md over the repo root CLAUDE.md — the root one is canonical.
```

Hooks are **opt-in**. To test them, merge `claude-suite/settings.json`'s `hooks` and
`permissions.allow` blocks into `.claude/settings.json`. Leave them out if you want a
hooks-free first pass.

Then **fully restart Claude Code** (new skill directories are only watched from session start).
Optionally set the output style: `/output-style terse-engineer`.

> Want it isolated instead? Copy into a scratch repo's `.claude/` plus the 11 foundation skills,
> or into `~/.claude/` for global. The plan below is identical.

---

## Part 3 — The test plan

Two depths. Run the **Smoke test** (~15 min) for confidence it loaded; run the **Full
evaluation** (phases 2–8) before relying on it.

### Smoke test (do this first)
1. Restart, then run `/help` or open the skills list — confirm the new skills appear.
2. Re-run the mechanical gates from the repo root (should still be green post-install):
   ```sh
   node .claude/skills/suite-audit/scripts/audit.mjs claude-suite
   ```
3. Type a trigger phrase: **"design the schema for users and projects"** → expect
   `schema-design` to engage.
4. Run a command: **`/gates src`** → expect it to sequence rule-audit → a11y-gate →
   security-pass.
5. Author a throwaway primitive: **"create a skill for rate-limiting tRPC procedures"** →
   expect `skill-create` to drive it and write a house-style `SKILL.md`. Delete it after.

If all five behave, the suite is loaded and wired. Then go deep:

### Phase 2 — Discovery & trigger fidelity
For a representative phrase per domain (full list: `docs/composition-map.md`), type it and
record which skill activates. Test both **true positives** (should trigger) and **true
negatives** (a near-miss phrase that should NOT trigger that skill).

| Phrase typed | Expected skill | Actually triggered? | Notes |
|---|---|---|---|
| "build the X feature" | vertical-slice | | |
| "add an index for this query" | index-strategy | | |
| "store money for invoices" | money-modeling | | |
| "paginate this list" | pagination-cursor | | |
| "is this library edge-compatible" | tech-evaluation | | |
| "write the API docs" | api-docs-from-trpc | | |
| "audit this diff" | rule-audit | | |
| "review my code" (quality) | code-review (not rule-audit) | | |
| "deploy a migration" | migration-deploy-coordination | | |
| "summarize this thread" | summarize-thread | | |

Watch especially for **collisions** between overlapping pairs: `rule-audit` vs `code-review` vs
`type-chain-audit`; `vertical-slice` vs `nextjs-app-router`; `schema-design` vs `index-strategy`.
If the wrong one fires, narrow the loser's `description`.

### Phase 3 — The self-growing core (meta-skills)
This tests the most important capability and needs no app.
- "create a skill for X" → `skill-create` writes a complete, lint-clean skill. Run
  `node .claude/skills/skill-create/scripts/lint-skill.mjs .claude/skills/<new>` → 0.
- "create a read-only agent that finds dead code" → `agent-create` writes least-privilege tools
  (no Write/Edit).
- "add a /foo command that runs vertical-slice" → `command-create` writes a thin body.
- "add a hook that blocks committing .env" → `hook-create` writes a contract-correct script +
  settings wiring.
- Then run `suite-audit` → still 0 structural. Delete the throwaways.

### Phase 4 — Hooks in a live session (only if you merged settings.json)
| Action to take | Expected hook behavior |
|---|---|
| Try to Edit the repo root `CLAUDE.md` | `protect-source-of-truth` blocks (exit 2) |
| Ask to write a file with `NEXT_PUBLIC_API_SECRET` | `no-secrets-guard` blocks |
| Ask to add `import { PrismaClient }` somewhere | `drift-guard` warns (non-blocking) |
| Write any `SKILL.md` | `skill-lint` reports its lint result |
| Start a fresh session | `session-context` prints recent DECISIONS.md |
| End a turn with uncommitted `.ts` changes | `stop-gates-reminder` nudges `/gates` |
| (in a git repo) attempt `git commit` with a rule-violating staged file | `pre-commit-gate` blocks |

### Phase 5 — Commands
Run each and confirm it invokes the named skill/agent rather than improvising:
`/slice`, `/audit`, `/schema`, `/gates`, `/research`, `/plan`, `/skill-new`, `/decision`,
`/refresh`, `/checkpoint`, `/debug`. Note any command that reimplements logic instead of
delegating (a bug — fix the command body).

### Phase 6 — Agents
Spawn 3–4 on a sample diff/file and confirm tools + output shape:
- `t3-reviewer` on a diff → ranked `[rule N]` findings + coverage tally; **makes no edits**.
- `n1-hunter-agent` on a router → located suspected N+1s.
- `feature-planner` on a feature → a slice plan with the ownership question surfaced.
- `research-analyst` on a question → cited synthesis.

### Phase 7 — End-to-end on a real app (the real functional test)
Most skills assume a T3 project. Stand one up, then exercise the build loop:
1. "scaffold the app" → `t3-genesis` creates the rails.
2. "set up the design tokens" → `design-tokens`. "design the schema for …" → `schema-design`.
3. "build the <feature>" → `vertical-slice`. Inspect the output against the nine rules by eye.
4. `/gates src/<feature>` → rule-audit/a11y/security run on real code.
5. Run 3–4 specialist skills against the generated code: `n1-hunter`, `type-chain-audit`,
   `bundle-analysis`, `trpc-integration-test`. Confirm each produces actionable, correct output.
6. Make a schema change → `migration-author` → `migration-deploy-coordination`.

### Phase 8 — The "evaluated" gate (building-skills)
A skill isn't truly evaluated until its baseline is real. For your top ~5 highest-leverage
skills (e.g. `vertical-slice`, `multitenancy-scoping`, `rule-audit`, `n1-hunter`,
`money-modeling`):
1. Run the skill's task **without** the skill loaded; capture what actually goes wrong.
2. Use the `baseline-capture` skill to replace the `Baseline failure (REPLACE WITH OBSERVED
   TRANSCRIPT)` placeholder with that real transcript.
3. Dual-session test: with vs without the skill on the same task — does the skill change the
   outcome for the better? If not, the skill (or its description) needs work.

---

## Part 4 — Scoring rubric (what "passes")

For each primitive class, it passes when:
- **Skill:** triggers on ≥3 of its phrases, does NOT trigger on the negative phrase, produces
  output that honors the nine rules, and hands off correctly. (Evaluated = Phase 8 done.)
- **Agent:** spawns with the stated tools, returns the stated output shape, and a read-only
  agent makes zero edits.
- **Command:** activates the named skill/agent and threads `$ARGUMENTS`; orchestrators run the
  full sequence.
- **Hook:** fires on its event, blocks/allows per its contract, and a block prints an
  actionable reason.

Track an overall score: _N of 72 skills trigger-verified_, _N of 16 agents verified_, _N of 25
commands verified_, _N of 8 hooks verified_, _N of 5 priority skills baseline-evaluated_.

---

## Part 5 — Triage by failure type

| Symptom | Likely cause | Fix |
|---|---|---|
| Skill never triggers | weak/over-narrow `description` triggers | broaden `Use when:`; add the phrase you tried |
| Wrong skill triggers | two descriptions overlap | narrow the loser; sharpen `Do NOT use for:` |
| Skill triggers but output is wrong | content/procedure bug | fix the SKILL.md/reference; re-lint; re-review |
| New skill won't appear | created mid-session | restart the session |
| Hook doesn't fire | not in `settings.json` / wrong matcher | check the `hooks` block + matcher |
| Hook blocks too much | matcher too broad | tighten the matcher / the in-script condition |
| Command improvises | body reimplements the skill | rewrite to name+invoke the skill |
| `suite-audit` flags a dead ref | renamed/removed primitive, or external slug | fix the ref, or add to the FOUNDATION allowlist |

Re-run `node .claude/skills/suite-audit/scripts/audit.mjs claude-suite --write` after any batch
of fixes to keep the structure clean and the composition map current.
