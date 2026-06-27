# suite-audit scripts

## audit.mjs — suite-wide mechanical audit + composition-map regeneration

```
node audit.mjs <suite-root>            # audit only
node audit.mjs <suite-root> --write    # audit + regenerate docs/composition-map.md
```

**Exit code = number of structural findings** (malformed frontmatter, missing required sections,
a read-only agent holding Write/Edit). **0 = structurally sound.** Warnings (dead references,
duplicate triggers, missing tools line) are printed but do **not** affect the exit code — they
need a human judgment call.

It reuses `../../skill-create/scripts/lint-skill.mjs` for the per-skill structural lint, so the
two never drift. See `../references/checks.md` for the full check list and the foundation
allowlist (edit the `FOUNDATION` set in `audit.mjs` to register legitimate external slugs).

Run it after any generation/edit batch and before publishing the suite.
