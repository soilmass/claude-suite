Purpose: grade evidence, weight the criteria, build the multi-axis trade-off matrix, and map the finished dossier onto the ADR sections handed to draft-adr.

# Evidence quality tiers

Tag every fact with its tier; never let a tier-4 claim outweigh a tier-1 measurement.

1. **Own measurement** — a spike, benchmark, or POC you ran on this stack. Strongest. A
   `spike-research` output lands here.
2. **Primary documentation** — the project's own docs, changelog, or source for an
   architectural fact (e.g. "the driver uses HTTP fetch, not TCP").
3. **Maintainer claim** — a vendor benchmark, roadmap, or status page. Useful but interested;
   treat performance/cost claims as upper bounds until verified.
4. **Secondary / hearsay** — blog posts, forum threads, social. Signal for what to verify, not
   evidence to decide on.

Every cell is **dated** — the Drizzle/Clerk/edge-driver standings, version support, and cost
numbers perish (see `../../CLAUDE.md` maintenance note). An undated cell is a future bug.

# Criteria checklist (weight before gathering)

Pin and weight the axes that matter for *this* decision before you collect a single fact. A
typical edge-stack set:

- **Edge compatibility** — usually a must-pass gate (see `decision-framing.md`), not a weighted
  score.
- **Type-chain fit (Rule 1)** — first-class TS types, no `any` at the boundary.
- **Operational cost** — pricing at realistic p75 volume, free-tier ceiling, cost shape
  (per-request vs flat). Edge cost is dominated by log/egress discipline — factor it.
- **Lock-in / reversibility** — data export story, standard protocol vs proprietary, how the
  one-way-door classification lands.
- **Bundle / cold-start impact** — edge bundle size, cold-start latency.
- **Maintenance & community** — release cadence, open-issue health, last commit, funding.
- **Operational surface** — observability, replay/idempotency, failure modes (pairs with the
  spine's OTel/Sentry + log-discipline expectations).

Weighting tip: distinguish **must-pass gates** (binary, eliminate on fail) from **weighted
criteria** (scored among survivors). Mixing the two is how an edge-incompatible option survives.

# The trade-off matrix

Options as rows, criteria as columns. Each cell = a short finding + tier tag + date + source.

| Option | Edge (gate) | Type-chain | Cost @p75 | Lock-in | Maint. |
|--------|-------------|------------|-----------|---------|--------|
| Status quo | n/a | … | … | … | … |
| Option A | PASS | T2: typed client (2026-06, docs) | T3: $X (vendor) | low: std HTTP | T2: weekly |
| Option B | FAIL — TCP only | — | — | — | — |

Rules for the matrix:
- **Keep it multi-axis. Never collapse to one averaged score** — a single number hides *where*
  the options differ, which is exactly what the ADR author needs to see.
- **Mark unknowns as explicit gaps** ("no benchmark exists → gap"), never blanks. A gap is a
  signal to spike, not a reason to guess.
- Eliminated-at-the-gate options stay in the matrix with the FAIL cell visible, so the ADR
  shows they were considered, not missed.

# Decisive forces

After the matrix is full, name the **1–2 criteria that actually tip the decision** — usually
where the surviving options diverge most on a high-weight axis. Everything else is context.
State them explicitly so `draft-adr` records *why*, not just *what*.

# Dossier → ADR section mapping (hand-off to draft-adr)

Package the research so `draft-adr` can lift it directly. The typical ADR shape:

- **Title / status** → leave to `draft-adr`.
- **Context** ← the framed question, forces, and hard constraints (from `decision-framing.md`).
- **Options considered** ← the option set incl. status quo, plus what was excluded and why.
- **Decision** ← the recommendation *lean* with its flip trigger (the ADR author may overrule).
- **Consequences** ← per-option consequences, the decisive forces, the reversibility call, and
  any follow-up triggers ("revisit if cost crosses $X / volume crosses N").
- **Evidence appendix** ← the dated, tiered matrix, so the decision is auditable later.

Record any fork you resolved in passing in `DECISIONS.md` (date + one-line rationale) before
handing off — `draft-adr` writes the ADR, but the lightweight decision log is updated here.
