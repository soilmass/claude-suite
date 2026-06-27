---
description: Lint the whole suite structurally (suite-audit) + regenerate the composition map
argument-hint: "[suite-root, default claude-suite]"
allowed-tools: Bash(node:*), Read, Grep, Glob
---

Run the `suite-audit` skill over the suite root (default `claude-suite`): $ARGUMENTS

Run `node .claude/skills/suite-audit/scripts/audit.mjs ${1:-claude-suite}` to check the structural
contract across every skill / agent / command — frontmatter, the ten-section order, least-privilege
tools, resolvable cross-references, and duplicate triggers — and report findings grouped by primitive.
Add `--write` to also regenerate `claude-suite/docs/composition-map.md`. Exit code = number of
structural findings; 0 = clean.

This is the suite's own lint gate — distinct from `/audit`, which runs the `rule-audit` skill over
application code. Use this after authoring or editing any primitive.
