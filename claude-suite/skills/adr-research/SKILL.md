---
name: adr-research
description: >
  Assemble the decision dossier that an Architecture Decision Record is written from: frame
  the question and its forces, enumerate a MECE option set (including the status quo), pin the
  weighted evaluation criteria before gathering evidence, collect dated primary evidence per
  option, and build a trade-off matrix that names the decisive forces and reversibility
  (one-way vs two-way door). Produces the Context/Options/Consequences raw material, not the
  ADR prose. Reuses the project's already-decided spine in `../../CLAUDE.md` and `DECISIONS.md`
  so a settled fork is never re-litigated.
  Use when: "research for an adr", "options for a decision", "gather evidence for decision",
  "decision research".
  Do NOT use for: writing the ADR document itself (use draft-adr), or evaluating a single
  named tool in depth (use tech-evaluation).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the decision-research failure class: jumping to a favored
    option, gathering evidence to confirm it (motivated reasoning), and handing the ADR author
    an unweighted, uncited, one-option-deep brief. Baseline section is the encoded failure
    class; replace with an observed transcript.
---

# adr-research

The pre-decision research skill. It produces the *evidence base and trade-off matrix* an
Architecture Decision Record is written from — the framed question, the full option set, the
weighted criteria, and dated evidence per option — so the ADR records a defensible decision
rather than a rationalized one. It does not write the ADR; it hands its dossier to `draft-adr`.

The spine in `../../CLAUDE.md` is already decided and is not a research subject — this skill
researches the open forks *within* that spine (a driver class, a queue, a payment provider, a
caching strategy), checking `DECISIONS.md` first so a settled fork is never reopened.

---

## When to Use

- A significant architectural choice is open and someone will record an ADR after it.
- You must compare two or more real options (a driver, a queue, a vendor, a pattern) on more
  than one axis and the choice is hard to reverse.
- The decision touches the edge-runtime constraint and you need evidence that candidates are
  edge-compatible before committing.
- A stakeholder asks "what are our options for X" or "gather the evidence for this decision."

## When NOT to Use

- Writing the ADR document, its status, and its prose → `draft-adr` (this skill feeds it).
- A deep single-tool assessment (does *this one* library fit the stack) → `tech-evaluation`
  (this skill *consumes* it for per-option depth).
- Re-confirming dated facts in the canon (versions, OWASP order, CWV thresholds) →
  `perishable-refresh`.
- A time-boxed code experiment to answer one feasibility question → `spike-research`.
- A market/competitor scan with no architecture decision attached → `competitive-analysis`.

---

## Procedure

1. **Frame the decision and check it isn't already settled (high-interrogation).** Write the
   question as one sentence, the forces pulling on it, and the hard constraints from the spine
   (edge runtime, type-chain, the nine rules). Grep `DECISIONS.md` and `../../CLAUDE.md`
   first: if the fork is already resolved, stop and point there instead of researching. A
   mis-framed question wastes every step after it. See `references/decision-framing.md`.

2. **Enumerate a MECE option set, including the status quo.** List the genuinely distinct
   candidates — and always include "do nothing / keep what we have" as an option with its own
   consequences. Collapse near-duplicates; name what you deliberately excluded and why. See
   `references/decision-framing.md`.

3. **Pin weighted criteria BEFORE gathering evidence (high-interrogation).** Define and weight
   the axes (edge compatibility, type-chain fit, operational cost, lock-in, bundle/cold-start,
   community/maintenance) up front. Fixing criteria before evidence is the single guard against
   motivated reasoning — choosing the answer then collecting support. See
   `references/evidence-matrix.md`.

4. **Gather dated primary evidence per option.** For each option collect evidence tied to a
   criterion, tagged by quality tier (own spike/benchmark > primary docs > maintainer claim >
   blog/hearsay) and dated (these facts perish). For a single option needing real depth,
   delegate to `tech-evaluation` and fold its verdict in. See `references/evidence-matrix.md`.

5. **Build the trade-off matrix.** Fill options × criteria with cited cells; mark unknowns as
   explicit gaps, not blanks. Do not average scores into a single number — keep the axes
   visible so the ADR author sees *where* options differ. See `references/evidence-matrix.md`.

6. **Name the decisive forces and reversibility.** Identify the 1–2 criteria that actually tip
   the choice, and classify it as a two-way door (cheap to reverse — bias to act) or a one-way
   door (expensive — research harder). State a recommendation *lean* with its trigger to flip,
   never a fake-certain verdict. See `references/decision-framing.md`.

7. **Package the dossier for draft-adr.** Emit the framed context, the option set, the matrix,
   the decisive forces, and the per-option consequences mapped to the ADR's Context / Decision
   / Consequences sections. Record any new fork you resolved in passing in `DECISIONS.md`. See
   `references/evidence-matrix.md`.

---

## Composes With

- **Consumes:** `tech-evaluation` — for any single option that needs deep, stack-specific
  assessment, this skill calls it and folds the verdict into one matrix cell rather than
  re-deriving it.
- **Feeds:** `draft-adr` — the dossier (context, options, matrix, decisive forces,
  consequences) is the input `draft-adr` turns into the recorded ADR; this skill stops at the
  hand-off and writes no ADR prose.
- **Pairs with:** `spike-research` (a time-boxed experiment becomes one tier-1 evidence cell),
  `perishable-refresh` (re-dates evidence before a stale fork is reopened).
- **Hands off:** a resolved fork → record in `DECISIONS.md`; the written record → `draft-adr`.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project
> conventions). The encoded failure class was confirmed.

**Observed run.** Asked to research client-state options, the agent produced a polished
"Zustand vs React Context" comparison doc that never read `CLAUDE.md`/`DECISIONS.md` (so it
couldn't tell if the fork was already settled), seriously weighed only **two** options with no
status-quo entry, and wrote the comparison table and recommendation together — criteria invented
*after* the conclusion. Evidence was from memory with no dates or sources, and reversibility was
asserted, not analyzed:

```
## Reversibility
Both are pretty easy to swap later since usage is hook-based behind a custom
hook; migrating a slice from Context to Zustand or back is a localized change ...
```

**Failure class (confirmed).** Decision research drifts into motivated reasoning: a favored
option is chosen first, then a confirming brief is written with post-hoc criteria, an
under-populated non-MECE option set, undated uncited evidence, and a hand-waved one-way-vs-
two-way-door call. It hands the ADR author a conclusion to rubber-stamp, not a dossier to
decide from. This skill prevents it by pinning weighted criteria before evidence, forcing a
MECE option set with the status quo, and demanding dated primary evidence and an explicit
reversibility classification.

---

## Examples

**Input:** "Research our options for queuing background work on the edge stack."
**Output:** Question framed ("how do we run deferred work given no long-lived process at the
edge?"); options = {Upstash QStash, Inngest, Trigger.dev, DB-polled cron, do-nothing/inline};
criteria weighted (edge HTTP-trigger compatible = must-pass, lock-in, replay/observability,
cost at p75 volume). Matrix with dated cells, edge-incompatible candidates failed at the gate,
QStash vs Inngest as the live trade-off, classified two-way door → lean QStash with "flip if we
need step-function fan-out." Packaged for `draft-adr`; not yet written as an ADR.

**Input:** "What are our options for the analytics datastore?"
**Output:** Status-quo (Postgres + rollup table) is option zero; one-way-door (migration is
expensive) → deeper evidence demanded. ClickHouse vs Tinybird depth delegated to
`tech-evaluation`, verdicts folded into two cells; decisive force named (p75 query latency over
a 90-day window), unknowns flagged as gaps, recommendation withheld pending a `spike-research` run.

**Input:** "Pick our edge DB driver — research it."
**Output:** Grep finds the Neon-vs-Turso fork already resolved in `DECISIONS.md`; skill stops,
cites the record, and offers `perishable-refresh` to confirm the standings are still current
instead of re-running settled research.

---

## Edge Cases

- **The fork is already in `DECISIONS.md`** → stop; cite the record and offer
  `perishable-refresh` to re-date it, rather than re-opening a closed decision.
- **Only one viable option survives the constraints** → there is no decision to research; write
  a one-line `DECISIONS.md` note on *why* it was forced and skip straight to `draft-adr`.
- **Evidence is irreducibly unknown** (no benchmark exists, vendor won't say) → mark the matrix
  cell a gap and hand to `spike-research` to generate tier-1 evidence; do not guess to fill it.
- **It's a two-way door with low stakes** → cap the research; over-researching a cheaply
  reversible choice is its own failure. Lean, decide, move, revisit if the trigger fires.

## References

- `references/decision-framing.md` — framing the question and its forces, the spine/constraint
  checklist, checking `DECISIONS.md` first, MECE option enumeration with the status-quo option,
  reversibility (one-way vs two-way door), and the recommendation-lean format with a flip trigger.
- `references/evidence-matrix.md` — the evidence-quality tiers, the edge-stack criteria
  checklist, the weighted trade-off-matrix template (kept multi-axis, never averaged), and the
  dossier-to-ADR section mapping handed to `draft-adr`.

## Scripts

`scripts/` is reserved. A signal that would justify one: a helper that greps `DECISIONS.md`
and the ADR directory for an existing record matching the decision's keywords, so step 1's
"already settled?" check is mechanical rather than manual.
