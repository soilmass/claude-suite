# skill-create scripts

## lint-skill.mjs — structural validator

```
node lint-skill.mjs <skill-dir> ...      # one or more skill directories
node lint-skill.mjs ../..                 # every skill under a skills/ root (descends one level)
```

Exit code = number of findings. **Exit 0 means structurally valid, not good** — it does not
judge whether the procedure is correct or the baseline is real.

### What it checks
- Frontmatter present; `name` matches the directory; `license` present.
- `description` present and carries both `Use when:` and `Do NOT use for:`.
- `source_of_truth` present and resolvable to an existing file.
- `# <slug>` title heading present.
- The eight required section headings present **and in order**: When to Use, When NOT to Use,
  Procedure, Composes With, Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT), Examples,
  Edge Cases, References.
- The baseline section still contains `Failure class encoded:` (the labeled placeholder).

### What it does NOT check
- Whether the procedure is correct, the examples real, or the references useful.
- Content of `references/` or `scripts/`.
- Whether the skill should exist at all (that's the `is-it-a-skill.md` judgment).

Used by `suite-audit` (Wave 9) to lint the whole suite at once.
