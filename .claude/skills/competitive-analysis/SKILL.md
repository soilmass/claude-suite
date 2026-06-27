---
name: competitive-analysis
description: >
  Produce a structured competitor and feature analysis where every claim is sourced,
  dated, and traceable, and where the verdict lands in a comparison matrix rather than
  prose. Forces a fixed criteria set decided before the scan so competitors are judged
  on the same axes, and quarantines unverified marketing claims from observed facts.
  Use when: "competitive analysis", "compare competitors", "feature comparison",
  "market scan". Do NOT use for: finding existing code patterns to reuse (use
  prior-art-search), synthesizing a body of docs or papers into one narrative (use
  literature-synthesis).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the failure class of unsourced, undated, asymmetric
    competitor comparisons that read as confident but cannot be audited or refreshed.
    Baseline section is the encoded failure class; replace with an observed transcript.
---

# competitive-analysis

Turn "how do we compare to X, Y, Z" into a defensible artifact: a fixed criteria set, a
comparison matrix, and a claim ledger where every cell traces to a dated source. The
failure this kills is the confident-but-unauditable scan — competitors judged on
different axes, marketing copy laundered into fact, and no date stamp, so the analysis
silently rots and no one can tell. See `../../CLAUDE.md` for the suite's broader
sourcing and decision-record discipline.

## When to Use

- Deciding build-vs-adopt by comparing your planned feature against shipping products.
- Positioning work: where you win, where you lose, where the category is moving.
- A market scan before committing to a roadmap bet or a pricing model.
- Periodic refresh of a prior comparison whose claims have aged.

## When NOT to Use

- Searching the codebase or ecosystem for an existing pattern/library to reuse — use
  `prior-art-search`; it ranks reuse candidates, not market rivals.
- Distilling many documents, papers, or RFCs into one synthesized narrative — use
  `literature-synthesis`; it owns multi-source summarization.
- Evaluating a single technology for adoption on the decided stack — use
  `tech-evaluation`; this skill compares many products on shared axes, not one in depth.
- Time-boxed unknowns answered by a throwaway prototype — use `spike-research`.

## Procedure

1. **Fix the criteria before looking at any competitor (interrogation: high).** Decide
   the axes — features, pricing model, integrations, target segment, limits, edge/runtime
   fit — and the scoring scale, *before* the scan. Picking axes after seeing a leader
   bends the whole matrix toward that leader. Record the criteria set and any weighting
   in `DECISIONS.md`. See `references/matrix-method.md`.
2. **Enumerate the competitor set explicitly (interrogation: medium).** List who is in,
   who is deliberately out, and why (out-of-segment, dead project, acquired). A missing
   obvious rival discredits the whole artifact. State the set with the user.
3. **Gather claims into a dated ledger, not prose.** For each competitor × axis, capture
   the claim, the source URL, the source *type* (vendor page, docs, third-party review,
   hands-on test), and the access date. Separate **observed** (you verified it) from
   **asserted** (vendor says so). See `references/source-discipline.md`.
4. **Verify the load-bearing claims (interrogation: high for anything driving the
   decision).** Pricing, hard limits, and "supports X" claims flip decisions — confirm
   those against primary sources or a hands-on check, not a comparison blog. Mark the
   confidence of every decision-driving cell.
5. **Build the comparison matrix.** Competitors as columns, criteria as rows, each cell a
   short verdict plus a citation marker into the ledger. The matrix is the deliverable;
   prose only explains it. See `references/matrix-method.md`.
6. **Write the verdict as asymmetric findings.** Where you win, where you lose, where the
   category is moving, and the build-vs-adopt or positioning call. Name the strongest
   counter-argument to your own conclusion.
7. **Stamp it and set an expiry.** Every claim is dated; the artifact carries an
   "as of <date>, re-verify by <date>" header because competitor facts perish. Hand
   recurring re-verification to `perishable-refresh` if it becomes a standing doc.

## Composes With

- **Pairs with:** `prior-art-search` (reuse candidates vs market rivals — run both when
  a build-vs-adopt call needs internal-reuse *and* external-market evidence) and
  `literature-synthesis` (feed its synthesized sources in as inputs to the claim ledger).
- **Hands off:** `tech-evaluation` when one competitor becomes the adoption candidate and
  needs deep single-product scrutiny; `perishable-refresh` to keep a standing matrix fresh.
- **Feeds:** roadmap and positioning decisions recorded in `DECISIONS.md`.

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project
> conventions). The encoded failure class was confirmed.

**Observed run.** Asked to compare "Our Product" against three competitors, the naive run
produced a clean-looking feature matrix and a confident win/loss verdict — but every cell
was an unsourced, undated placeholder it admitted it had generated rather than verified, and
there was no observed-vs-asserted split and no "as of" date anywhere. The agent itself flagged
the values as fabricated:

```
| Integrations / marketplace | Growing (~20) | Extensive (100+) | Moderate (~50) | Few (~10) |
| Pricing transparency       | Public tiers  | Public           | Sales-led      | Public    |
DEFECTS: "Feature values (integration counts, mobile support, pricing model) are plausible
placeholders I generated rather than verified facts about real competitors."
```

**Failure class (confirmed).** Without fixed criteria, a dated claim ledger, and an
observed-vs-asserted split, a competitor scan ships as a confident-but-unauditable artifact:
plausible numbers laundered into fact, no citations or dates so no cell can be re-verified, and
the matrix silently rots. This skill forces every cell to trace to a dated source and quarantines
asserted claims from observed ones.

## Examples

- **Input:** "Compare us to Stripe, Lemon Squeezy, and Paddle for edge-deployed billing."
  → **Output:** Criteria fixed first (edge SDK support, webhook model, tax handling,
  pricing tiers, payout latency); a matrix with each cell citing a dated docs URL;
  observed-vs-asserted split (Paddle's "merchant of record" verified against their docs,
  not a blog); verdict noting our edge-runtime fit (per `../../CLAUDE.md`) as the axis we
  win and tax-handling as the axis we lose; "as of 2026-06-26, re-verify by 2026-09-26".
- **Input:** "Quick feature comparison of the top 3 headless CMSs."
  → **Output:** Set stated with one explicit exclusion (an acquired/sunset product);
  criteria including edge-runtime data fetching and webhook freshness; matrix + a
  build-vs-adopt note handing off to `tech-evaluation` for the front-runner.
- **Input:** "Market scan of auth providers vs Clerk."
  → **Output:** Clerk's edge-middleware fit (`clerkMiddleware`, per `../../CLAUDE.md`)
  as a fixed axis; competitors scored on the same axis; pricing claims verified against
  primary pricing pages with access dates, not summarized from a roundup article.

## Edge Cases

- **A competitor publishes no pricing** → record the cell as "opaque — contact sales,
  observed <date>", never guess; opacity is itself a finding.
- **Only a third-party review covers a claim** → mark it asserted with low confidence and
  flag it for hands-on verification before it drives any decision.
- **Two competitors collapse into one category** (acquisition, white-label) → note the
  relationship in the set rationale; do not double-count them as independent rivals.
- **The criteria set turns out wrong mid-scan** → stop, revise the axes explicitly, and
  re-score every competitor on the new set; never leave a half-old, half-new matrix.

## References

- `references/matrix-method.md` — criteria selection, scoring scales, and the comparison
  matrix + verdict templates.
- `references/source-discipline.md` — the claim ledger format, observed-vs-asserted rules,
  source-type ranking, dating, and re-verification cadence.

## Scripts

Reserved. A script would be justified if the claim ledger grows large enough to want a
validator that flags cells missing a source URL or an access date, or that surfaces
claims past their re-verify-by date.
