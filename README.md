# claude-suite

A comprehensive, opinionated **Claude Code primitive suite** for building, reviewing, and
operating projects on a decided **edge T3 stack** — *Next.js App Router + Drizzle + Clerk + tRPC
+ Tailwind v4 + Zod + React Hook Form, on the edge runtime*.

It bundles **82 skills, 16 subagents, 25 slash commands, and 8 hooks** into one coherent system,
all anchored to a single source of truth (`CLAUDE.md` and its **nine inviolable rules**) so the
primitives compose instead of conflict. Every skill is **baseline-evaluated** against a real
captured failure, routing is **trigger-fidelity tested**, and the whole thing was built — and
hardened — by dogfooding Claude Code on itself.

```
82 skills · 16 agents · 25 commands · 8 hooks
suite-audit: 0 findings / 0 warnings   ·   baselines: 82/82 evaluated
trigger-fidelity: 64/64 routed correctly   ·   distribution↔install drift: 0
```

---

## What this is

Most "awesome-claude-code" collections are grab-bags of independent snippets. This one is the
opposite: a **single decided stack, taken to depth**. Breadth comes from covering every layer and
concern of that one stack — not from multiplying languages — so each primitive cites the same
rules and hands off cleanly to its siblings.

- **Skills** — repeatable, failure-prone procedures (design a schema, build a type-safe slice,
  author a safe migration, run the rule/a11y/security gates, …).
- **Agents** — delegated, least-privilege workers (read-only reviewers, a feature planner, a
  build-error resolver, …).
- **Commands** — thin keystroke entry points (`/slice`, `/gates`, `/audit`, `/skill-new`, …).
- **Hooks** — deterministic guards that fire automatically (block secret leaks, protect the
  source of truth, gate commits, surface drift).

## The decided stack & the nine rules

The spine lives in [`CLAUDE.md`](CLAUDE.md): App Router only, **edge runtime** (the fork that put
Drizzle over Prisma), Clerk edge middleware, thin tRPC procedures, one shared Zod schema per
operation, Tailwind v4 CSS-first tokens, shadcn/Radix primitives. The **nine inviolable rules**
every primitive enforces:

1. Unbroken type chain (no `any`/`@ts-ignore` across a boundary) · 2. Ownership check on every
protected procedure · 3. No hardcoded style values (tokens only) · 4. All four component states ·
5. Money is never a float · 6. Timestamps are `timestamptz` UTC · 7. No N+1 access · 8. Validated
boundaries (Zod) · 9. No secrets client-side.

## What's inside

```
.
├── CLAUDE.md              # source of truth: the spine + nine rules
├── DECISIONS.md           # append-only decision log
├── .claude/              # INSTALLED, live in this repo
│   ├── skills/           # 82 skills (10 foundation + 72 suite)
│   ├── agents/           # 16 subagents
│   ├── commands/         # 25 slash commands
│   ├── hooks/            # 8 executable hooks
│   └── settings.json     # hook wiring + permissions
└── claude-suite/         # the portable DISTRIBUTION (copy this into any .claude/)
    ├── skills/ agents/ commands/ hooks/
    ├── settings.json     # hook wiring template ($CLAUDE_PROJECT_DIR)
    ├── mcp/recommended.json
    ├── output-styles/
    ├── docs/             # house-style.md (the authoring contract) + composition-map.md
    ├── tests/trigger-fidelity/   # re-runnable routing QA harness
    ├── CLAUDE.md  DECISIONS.md  README.md
    └── examples/projects-slice/  # a validated clean reference feature
```

### Domains covered
- **Software development** — framework depth (Next.js App Router, Drizzle, tRPC, Clerk, Zod, RHF,
  Tailwind, edge runtime), testing & verification, quality/review gates, database & data
  lifecycle, DevOps/CI/deploy/observability.
- **Research** — tech-evaluation, spikes, ADR research, benchmarks, prior-art & competitive
  analysis, literature synthesis.
- **Writing** — technical docs, API reference from tRPC, READMEs, changelogs, release notes,
  diagrams, thread summaries.
- **Productivity & meta** — the four meta-skills (`skill-create`/`agent-create`/`command-create`/
  `hook-create`), `suite-audit`, `baseline-capture`, `decision-log`.

## Install

These are standard Claude Code primitives — copy or symlink them into a project's `.claude/`.

```sh
git clone https://github.com/soilmass/claude-suite
cd your-project
mkdir -p .claude/skills .claude/agents .claude/commands .claude/hooks
cp -r /path/to/claude-suite/claude-suite/skills/*   .claude/skills/
cp -r /path/to/claude-suite/claude-suite/agents/*   .claude/agents/
cp -r /path/to/claude-suite/claude-suite/commands/* .claude/commands/
cp -r /path/to/claude-suite/claude-suite/hooks      .claude/hooks
cp    /path/to/claude-suite/claude-suite/CLAUDE.md  .         # if your repo has none yet
```

Then merge `claude-suite/settings.json` into your `.claude/settings.json` to enable the hooks
(they're **opt-in** — review them first; they make no network calls and hold no secrets). Restart
Claude Code so new skill directories are watched. Full details:
[`claude-suite/README.md`](claude-suite/README.md).

> Hooks use `$CLAUDE_PROJECT_DIR` in the template so they resolve from any working directory.

## Self-growing & self-maintaining

- **Grow it:** ask for "a skill / agent / command / hook for X" and the matching meta-skill
  authors it to the contract in [`claude-suite/docs/house-style.md`](claude-suite/docs/house-style.md).
- **Keep it coherent:** `suite-audit` mechanically lints frontmatter, section structure,
  least-privilege tools, dead cross-references, and duplicate triggers, and regenerates the
  composition map.
- **Keep routing honest:** the [`tests/trigger-fidelity/`](claude-suite/tests/trigger-fidelity/)
  harness re-runs a blind routing test (does a natural phrase reach the right skill?) so a new
  description collision is caught before it ships.

## Why you can trust it

This suite was validated, not just generated:

- **Baselines: 82/82.** Per the building-skills discipline, every skill ships with a *real
  observed* failure transcript (captured by running the task without the skill), not an imagined
  one — so each skill fixes a problem proven to occur.
- **suite-audit: 0/0** structural findings/warnings; **0 drift** between the distribution and the
  installed copy.
- **Trigger fidelity: 64/64** — blind classifiers route natural phrases (including deliberate
  collision pairs like *"review my code"* vs *"audit this diff"*) to the intended skill.
- **Reviewed for accuracy.** An adversarial pass over the generated skills caught and fixed real
  API/edge-correctness bugs; dogfooding the hooks on this repo surfaced and fixed several more.

## Provenance

Built by using Claude Code's own primitives to build a suite of Claude Code primitives — then
installing it, running it against this repo, and fixing every issue that real use exposed. See
[`DECISIONS.md`](DECISIONS.md) for the resolved forks and the rationale behind the spine.

## License

Apache-2.0 (per each primitive's `license` field).
