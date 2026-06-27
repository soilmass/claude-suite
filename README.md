# T3 / AI-assisted stack — Claude skills suite (edge + Drizzle)

This directory builds the decided stack "to the highest degree." It is the concrete
realization of the capability-map document: a `CLAUDE.md` source of truth, a
`DECISIONS.md` decision log, and **ten skills** in `.claude/skills/`, each encoding a
real, repeatable, failure-prone task — not a one-shot, and not something a flat
`CLAUDE.md` rule already handles.

## Stack (this build)

Next.js App Router + **Drizzle** + Clerk (edge middleware) + tRPC + Tailwind v4 + Zod +
RHF, on the **edge runtime**. The edge target is the fork that put Drizzle over Prisma —
recorded in `DECISIONS.md`. The capability-map document was written around Prisma; every
skill here is retargeted to Drizzle/edge.

## Where this goes (placement)

Per the Claude skills docs, skills live in one of two places, and the **directory name —
not the frontmatter `name` — is what's authoritative** for invocation (they match here, so
either reading is safe):

- **Project-scoped (recommended for this suite):** keep `.claude/skills/` at your repo
  root. It gets committed to git and ships with the codebase, so every teammate gets the
  same skills. This is why `CLAUDE.md`, `DECISIONS.md`, and this `README.md` sit at the
  repo root *beside* `.claude/` — the docs specify the human-readable README belongs at the
  repository root, not inside a skill folder.
  ```
  your-repo/
  ├── CLAUDE.md          ← source of truth (auto-loaded by Claude Code)
  ├── DECISIONS.md
  ├── README.md          ← this file (repo root, per docs)
  └── .claude/skills/    ← the ten skills
  ```
  Drop the contents of this package at your repo root and commit.

  **What ships here is *only* the skills and their two guard files — never a project.**
  The application (`package.json`, `src/`, configs, the example feature) is an *output* of
  the skills, not part of this distributable. `t3-genesis` generates the rails;
  `vertical-slice` generates features; `schema-design` and `design-tokens` generate the
  data and token layers. Shipping a pre-built scaffold alongside the skills would create a
  second, drift-prone source of truth — so it isn't here by design.

  **First run in a fresh repo:** drop these files in, open Claude Code, and ask it to
  "scaffold the app" — `t3-genesis` triggers and stands up the project to the spec in its
  own `references/scaffold-layout.md`. From there, "design the schema," "set up the design
  tokens," and "build the X feature" each trigger the matching skill.

- **Personal (all projects on your machine):** copy the ten skill folders into
  `~/.claude/skills/`. They become available in every project but aren't committed
  anywhere. The same `SKILL.md` format works unchanged in Claude Code, the Claude desktop
  app, and the API.

Project-scoped skills override personal ones of the same name.

### Operational notes (from the docs)

- **Skills load at session start.** Editing a `SKILL.md` mid-session takes effect within
  the session (Claude Code watches the skill dirs), but creating a brand-new top-level
  skills directory that didn't exist at startup needs a restart so it can be watched.
- **Scripts run without entering context.** `rule-audit/scripts/scan.mjs` and
  `design-tokens/scripts/contrast.mjs` are executed via bash; only their output costs
  tokens, not their source — which is why the mechanical checks are cheap to run every PR.
- **Frontmatter is in the system prompt.** Only `name` + `description` load at startup
  (~100 tokens each); the body and `references/` load only when a skill triggers. Keep the
  descriptions as the trigger surface and let the references hold the bulk — which is how
  this suite is structured.
- **Trust:** these skills bundle executable scripts. The two real scripts make no network
  calls and hardcode no secrets; review them before enabling, as you should with any skill.

## How it's organized

```
CLAUDE.md            ← source of truth: the spine, the 9 inviolable rules, conventions
DECISIONS.md         ← every resolved fork, append-only (seeded with edge+Drizzle)
.claude/skills/
  t3-genesis/        ┐ genesis (run once)
  design-tokens/     │
  schema-design/     ┘
  vertical-slice/    ┐ daily loop (run constantly): creates / evolves
  refactor/          ┘
  rule-audit/        ┐ done-time gate trio
  a11y-gate/         │
  security-pass/     ┘
  migration-author/    data lifecycle (as schema evolves)
  perishable-refresh/  meta: keeps every skill's facts current
```

Each skill is a standard skill directory: `SKILL.md` + `references/` + `scripts/` +
`assets/`. Every skill points at the root `CLAUDE.md` as its source of truth, which is
what keeps ten skills behaving as one coherent suite instead of drifting apart.

## How the suite composes

```
                    t3-genesis  (run once)
                    /         \
          design-tokens     schema-design
                    \         /
        ┌──── vertical-slice ──┴── refactor ────┐   (run constantly)
        │     (creates)          (evolves)      │
        ┌──────────────┼──────────────┐         │
   rule-audit      a11y-gate     security-pass  │  migration-author
        └──────────────┴──────────────┘         │  (as schema evolves)
              (done-time gate trio)             │
                                                │
                    perishable-refresh ───── keeps every skill's facts current
```

Genesis sets the rails; the daily loop builds and evolves atop them; the gate trio
enforces the bar mechanically on what the loop produces; migration evolves the data layer
safely; the meta-skill keeps the system from rotting.

## The shared interaction model

Every skill shares four behaviors, **tuned by the cost of being wrong, not the size of the
task**:

1. **Interrogate before acting** — but only for what's load-bearing and not already known.
2. **Check completeness against an explicit definition-of-done, then self-report gaps.**
3. **Suggest beyond the literal request** — proportional to the skill.
4. **Defer, hand off, and record** (in `DECISIONS.md`) rather than overreach.

Calibration across the suite:

| Skill | Interaction posture |
|---|---|
| `t3-genesis` | low-interrogation (cheap to redo; scaffolds shouldn't editorialize) |
| `design-tokens` | high-interrogation (brand/mood are subjective + load-bearing) |
| `schema-design` | highest-interrogation (wrong cardinality is the costliest error) |
| `vertical-slice` | medium (runs constantly — fast but never skips the auth question) |
| `refactor` | confirm-scope-first (high blast radius) |
| `rule-audit` | suggestion-first (it exists to advise) |
| `a11y-gate` | suggestion-first (runs axe, names fixes + manual gaps) |
| `security-pass` | interrogation-as-the-method (the abuse questions ARE the deliverable) |
| `migration-author` | confirm-before-destructive (fragile, exact-command discipline) |
| `perishable-refresh` | report-and-propose (never rewrites the canon silently) |

## Suggested build/authoring order

The skills are written; this is the order to **harden** them (each needs a real observed
baseline — see the next section):

1. `vertical-slice` — highest daily leverage, richest baseline evidence fastest.
2. `rule-audit` — the enforcement counterpart; together they're the generate-then-check core.
3. `schema-design` + `design-tokens` — the genesis inputs the slice depends on.
4. `t3-genesis` — wraps the above into one scaffold.
5. `refactor`, `migration-author`, `a11y-gate`, `security-pass` — evolution, lifecycle, gates.
6. `perishable-refresh` — last; it presupposes the rest exist to refresh.

## IMPORTANT: the baseline-failure gate (read before trusting any skill)

Per the `building-skills` discipline these skills were written to follow, **a skill
written without a real observed baseline fixes an imagined problem.** Each `SKILL.md` here
has a `## Baseline failure` section written as the *failure class* the capability map
specifies — a faithful description of what goes wrong, but NOT a captured transcript of it
happening. Before treating any skill as evaluated:

1. Run its target task **without** the skill and capture what actually goes wrong.
2. Replace the `## Baseline failure` section with that real transcript.
3. Run the `building-skills` Stage 5 dual-session test and Stage 6 description-optimizer.

The skills are immediately usable as opinionated procedures; this gate is what makes them
*evaluated*. The map is the plan, not the baseline.

## What deliberately did NOT become a skill

Decided forks ("use Drizzle") → `CLAUDE.md` rules. Performance budget → CI script +
thresholds. Microcopy voice → `CLAUDE.md` + human pass. `DECISIONS.md` upkeep → rule +
trivial script. `CLAUDE.md` regeneration → script. Component composition → absorbed into
`vertical-slice`. Naming these keeps the suite lean.
