---
name: hook-create
description: >
  Author a new hook in this suite's house style: a fast, network-free executable wired in
  settings.json to a Claude Code event (PreToolUse, PostToolUse, Stop, SessionStart…), with a
  self-explaining block path and a documented exit-code contract — so automatic guards and
  reminders fire reliably without surprising the user.
  Use when: "create a hook", "add a pre-commit guard", "block X automatically", "run Y on
  every edit", "wire a hook", "automate a check on tool use".
  Do NOT use for: a procedure the model follows (use skill-create), a delegated worker (use
  agent-create), a keystroke trigger (use command-create).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the hook contract: fast, network-free, self-explaining
    block path, wired in settings.json. Baseline section is the encoded failure class;
    replace with an observed transcript.
---

# hook-create

Hooks are the only primitives the harness runs *for* you — deterministically, on every
matching event, without the model deciding to. That power is why they must be fast,
network-free, and explicit about why they block. This skill authors a hook script and wires
it into `settings.json` correctly.

Hook shape and event types are defined in `../../docs/house-style.md §4`; the spine/rules in
`../../CLAUDE.md`.

---

## Non-Negotiable Rules

- **Never write a slow or networked hook.** It runs on every matching event; a network call
  or a multi-second script makes the whole session drag. Read files, run regex, exit.
- **Never block silently.** A hook that denies a tool call MUST explain why on stderr with the
  fix, or the user is stuck guessing. Exit 2 = block-with-reason.
- **Never hardcode secrets or mutate state surprisingly.** A hook guards or annotates; it does
  not quietly rewrite the user's files or call out to a server.
- **Always make the matcher precise.** Match the exact tool/command pattern; an over-broad
  `PreToolUse` matcher that fires on everything is noise that trains the user to ignore it.

Refuse: "it can hit an API to check"; "block without a message, they'll figure it out"; "match
all tool calls to be safe."

---

## When to Use

- A check must run automatically and deterministically, not when the model remembers
  (pre-commit rule scan, secret guard, source-of-truth protection).
- A reminder/context-injection should fire on a lifecycle event (Stop, SessionStart).

## When NOT to Use

- A model-followed procedure → `skill-create`. A keystroke trigger → `command-create`.
- A delegated multi-step job → `agent-create`.
- A check that needs the network or takes seconds → make it a CI gate, not a hook.

---

## Procedure

1. **Pick the event and matcher (low-interrogation, but get the matcher exactly right).**
   `PreToolUse` to allow/deny before a tool runs; `PostToolUse` to react after; `Stop` /
   `SessionStart` for lifecycle. Match the precise tool name and (for Bash) command pattern.
   See `references/events-and-wiring.md`.
2. **Write the script** (`hooks/<name>.mjs` or `.sh`): read the event JSON on stdin, do the
   fast check, exit 0 to allow or exit 2 to block (with a stderr message + fix). No network.
3. **Make the block message actionable.** Name what was blocked, which rule, and the fix.
4. **Wire it in `settings.json`** under `hooks.<Event>` with the matcher. Add any script it
   runs to the permissions allowlist so it doesn't prompt. See `references/events-and-wiring.md`.
5. **Add a permissions-conscious note.** If the hook runs another script (e.g. rule-audit's
   `scan.mjs`), reference it by path; don't reimplement it.
6. **Document it in `hooks/README.md`** (event, matcher, what it blocks, exit codes) and record
   any fork in `DECISIONS.md`. Validate with `suite-audit`.

---

## Composes With

- **Feeds:** `hooks/` + the `settings.json` `hooks` block.
- **Pairs with:** `rule-audit` (the pre-commit hook runs its `scan.mjs`), `security-pass`
  (the secret guard enforces Rule 9 mechanically).
- **Hands off:** "this needs the model's judgment" → a skill via a `Stop` reminder, not a hard
  block; "this is a slow/networked check" → CI.
- **Runs against:** `../../docs/house-style.md §4`.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project
> conventions). The encoded failure class was confirmed.

**Observed run.** Asked to block commits that violate the project's rules, the agent produced
a standalone `.git/hooks/pre-commit` bash script — the wrong primitive entirely. It has no
frontmatter, lives outside `.claude/hooks/`, reimplements `rule-audit` as a grep subset
covering only ~4 of the nine rules (plus a `console.log` check that isn't one of them), greps
whole files instead of the staged diff so unrelated pre-existing violations block the commit,
and its messages name no rule doc or fix path. It even advertises the bypass:

```bash
  m=$(grep -nE '#[0-9a-fA-F]{3,6}\b' "$f" || true)   # flags any '#abc' — IDs, URLs, strings
  ...
  echo "  git commit --no-verify   (only if you know what you're doing)"
```

**Failure class (confirmed).** Without the house style the agent reaches for a raw git hook
and rebuilds an inferior linter in grep, rather than wiring a claude-suite hook that delegates
to `rule-audit` and points the developer at the specific rule. This skill prevents producing
the wrong primitive shape — and the self-defeating gate (partial coverage, file-wide false
positives, a `--no-verify` invitation) that comes with it.

---

## Examples

**Input:** "Block a commit if rule-audit finds violations."
**Output:** A `PreToolUse` hook matching `Bash` with command `~git commit~`, that runs
`rule-audit/scripts/scan.mjs` on the staged diff, exits 2 with
`"Blocked: rule-audit found N candidates — run /audit and fix or commit with --no-verify
intent stated"` on findings, exits 0 otherwise. Wired in `settings.json`; `scan.mjs` added to
the allowlist.

**Input:** "Remind me to run the gates before I stop."
**Output:** A `Stop` hook that checks whether the gates ran this session and, if not, prints a
reminder (non-blocking) — not a hard deny, because "did you run the gates" is advisory.

---

## Edge Cases

- **The check needs judgment** → don't hard-block; use a `Stop`/`PostToolUse` reminder.
- **The matcher might catch unrelated calls** → tighten it; test against the events you expect.
- **The hook would be slow** → move it to CI; hooks must be instant.
- **Blocking would trap the user** → always provide the escape (what to fix, or the explicit
  override) in the stderr message.

---

## References

- `references/events-and-wiring.md` — the event types, the stdin/stdout/exit-code contract,
  matcher syntax, and the `settings.json` `hooks` + permissions-allowlist wiring.

## Scripts

`scripts/` reserved. The hooks themselves live in the suite-level `hooks/` directory (not
inside this skill); `suite-audit` validates their wiring in `settings.json`.
