# Trigger-fidelity test

A re-runnable check that natural phrases route to the **right skill** — the one thing skill
descriptions can get wrong (a `Use when:` that's too broad, or two skills that collide). It is a
*blind* test: fresh classifier agents, given only the real skill catalog and one phrase, pick the
skill they'd invoke. A pick outside the phrase's **acceptable set** is a real misroute.

It's a proxy for the harness's own router (fresh agents, not literally the dispatcher), but an
honest, unbiased one — and it reliably surfaces description collisions before they ship.

## Run it

From the repo root:

```sh
# 1. Build the catalog from the installed skills (deterministic; writes .catalog.md)
node claude-suite/tests/trigger-fidelity/build-catalog.mjs

# 2. Run the routing workflow (spawns one blind classifier per phrase)
#    Via Claude Code's Workflow tool:
#    Workflow({ scriptPath: "claude-suite/tests/trigger-fidelity/route-test.workflow.mjs" })
#    (optionally pass a catalog path: args: { catalog: "/abs/path/.catalog.md" })
```

The workflow returns:
- `passed` — e.g. `64/64` in the acceptable set
- `misroutes` — each `{ phrase, picked, acceptable, runnerUp, confidence, reason }` to act on
- `lowConfidence` — picks the model was unsure about (expected only for genuinely ambiguous phrases)

## Interpreting results

- **0 misroutes** → descriptions route cleanly; nothing to do.
- **A misroute** → open the picked skill and the intended skill; tighten the intended skill's
  `Use when:` and add a `Do NOT use for:` line pointing at the picked one (and vice-versa). Re-run
  to confirm the fix doesn't regress another case.
- **A `low`/`medium` confidence on an ambiguous phrase** (multiple acceptable slugs) is healthy —
  it means the model is honest about a genuinely underspecified request.

## Maintaining the case set

`route-test.workflow.mjs` holds `CASES` inline: `[phrase, [acceptable slugs], note]`. When you
add a skill, add 1–2 phrases for it — and, importantly, a phrase that *should* go to a sibling but
might be tempted to your new skill (a collision probe). Keep `acceptable` honest: a single slug for
unambiguous phrases, multiple only when any of them is genuinely a correct route.

## Notes

- `.catalog.md` is generated and git-ignored — rebuild it whenever skills change.
- Last full run (2026-06-26): **64/64 in acceptable set, 0 misroutes**, with `medium`/`low`
  confidence appearing only on the deliberately ambiguous phrases.
