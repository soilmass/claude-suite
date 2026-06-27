# DECISIONS.md — Decision Records (`claude-suite`)

Each entry records a resolved fork: a place where `CLAUDE.md` states an abstract default and
this suite made it concrete, or where a primitive resolved a choice the project had not yet
decided. Append-only. Newest at top. Date + one-line rationale, minimum. Primitives MUST
record here rather than choosing silently.

Format:
```
## YYYY-MM-DD — <short title>
**Decision:** <what was decided>
**Context:** <the fork / what prompted it>
**Rationale:** <why this over the alternative>
**Consequences:** <what this now constrains downstream>
**Decided by:** <human | primitive-name + human sign-off>
```

---

## 2026-06-26 — Suite leans into the T3 edge stack, not polyglot
**Decision:** Every primitive in `claude-suite` assumes the decided Next.js App Router +
Drizzle + Clerk + tRPC + Tailwind v4 + Zod + RHF edge stack and the nine rules. Breadth
comes from depth across the T3 layers and the four domains (build, research, writing,
productivity/meta), not from per-language variants.
**Context:** The user asked for "broad sprawl (100+)" AND "lean into the T3 stack." Those
pull opposite directions (the reference repos multiply programming languages).
**Rationale:** A polyglot suite over a single decided stack would carry dozens of primitives
that contradict the spine. Depth over one stack keeps every primitive citing one source of
truth and composing cleanly.
**Consequences:** No python/go/rust reviewers. Skills like `code-review` and `test-strategy`
are TS/Next/Drizzle-specific. Research and writing skills are anchored to the stack (e.g.
`tech-evaluation` asks "does it work at the edge / bundle cost").
**Decided by:** human (AskUserQuestion) + planning sign-off

## 2026-06-26 — Distribution format: standalone directory, not a plugin
**Decision:** Ship as `claude-suite/` with top-level `skills/ agents/ commands/ hooks/`,
installed by copying or symlinking into a target `.claude/`. Not packaged as a Claude Code
plugin with `.claude-plugin/marketplace.json`.
**Context:** User chose "standalone new repo directory" over "plugin + marketplace."
**Rationale:** Matches the everything-claude-code reference repos; simplest to copy piecemeal.
**Consequences:** Install is a copy/symlink step documented in `README.md`; no marketplace
auto-update. A bundled `CLAUDE.md` ships with the suite so it stays self-contained.
**Decided by:** human (AskUserQuestion)

## 2026-06-26 — Existing 10 foundation skills are not moved
**Decision:** The parent repo's existing `.claude/skills/` (t3-genesis, design-tokens,
schema-design, vertical-slice, refactor, migration-author, rule-audit, a11y-gate,
security-pass, perishable-refresh) are left untouched. `claude-suite` adds new primitives
that compose with them by name.
**Context:** The suite extends, rather than replaces, the established foundation.
**Rationale:** Moving the 10 risks breaking the working setup and creating a second source
of truth. The new primitives reference the foundation skills as siblings.
**Consequences:** A few suite skills (e.g. `type-chain-audit`, `code-review`) deliberately
overlap-and-extend a foundation skill; each states the boundary in its "When NOT to Use."
**Decided by:** human (planning sign-off)
