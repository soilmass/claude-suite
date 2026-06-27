# suite-audit checks

What `scripts/audit.mjs` verifies. **Structural** findings count toward the exit code (they are
breakages). **Warnings** are judgment calls printed for review but not counted.

## Structural (exit-code findings)
- **Skills** (delegated to `skill-create/scripts/lint-skill.mjs`): frontmatter present; `name`
  matches the directory; `license`; `description` carries `Use when:` + `Do NOT use for:`;
  `source_of_truth` resolvable; `# <slug>` title; the eight required sections present and in
  order; the baseline placeholder intact.
- **Agents**: frontmatter present; `name` matches filename; `description` has `Use when:`; a
  `tools` line; a `## Output` section. **Least-privilege**: a read-only role (name contains
  review/audit/hunter/planner/describer) must NOT list `Write` or `Edit`.
- **Commands**: frontmatter `description` present.

## Warnings (printed, not counted)
- **Agent with no `tools` line** (inherits all tools) — usually a smell.
- **Command names no known primitive and isn't self-contained** — likely an empty/thin-but-broken
  command.
- **Dead cross-reference**: a kebab slug in a skill's "Composes With" / hand-off lines that is
  not a known skill/agent/command slug and not in the foundation allowlist.
- **Duplicate trigger**: the same `Use when:` phrase claimed by two skills.

## Foundation allowlist
`audit.mjs` holds a `FOUNDATION` set of slugs that live outside the suite but are legitimately
referenced: the parent repo's ten foundation skills (t3-genesis, design-tokens, schema-design,
vertical-slice, refactor, migration-author, rule-audit, a11y-gate, security-pass,
perishable-refresh) and harness skills (deep-research, draft-adr, draft-conventional-commit,
optimization-loop). Add to it when a new legitimate external reference appears — don't rename the
reference to silence the warning.

## Usage
```
node audit.mjs <suite-root>            # audit only; exit code = structural findings
node audit.mjs <suite-root> --write    # also regenerate docs/composition-map.md
```
