---
name: spike-research
description: >
  Run a timeboxed spike — a deliberately throwaway investigation to resolve a single
  unknown — and produce a findings memo that states a clear recommendation, the evidence
  behind it, and an explicit "what was NOT explored" boundary so the spike's gaps don't
  silently become production assumptions. Enforces a learning question and a time budget
  up front so the spike ends with a decision instead of drifting into half-built feature
  code on the edge stack (see ../../CLAUDE.md).
  Use when: "spike", "timeboxed investigation", "quick prototype to learn", "research spike".
  Do NOT use for: evaluating a named tool against criteria (use tech-evaluation), or
  measuring performance numbers (use benchmark-harness).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the unbounded-spike failure class: no learning question,
    no timebox, throwaway code merged, and unexplored gaps treated as proven.
    Baseline observed (clean-room capture).
---

# spike-research

A spike is a question, not a feature. This skill runs a timeboxed investigation that ends
in a findings memo with one recommendation and an explicit boundary of what it does NOT
cover. It exists to stop two failures: spikes that never end (drifting into half-built
features), and spikes whose unexamined gaps become unspoken production assumptions. The
spine and nine rules in ../../CLAUDE.md still apply to anything the spike recommends, but
spike *code* is throwaway and is never merged.

## When to Use

- A single unknown blocks a decision: "can the edge runtime do X", "is this approach
  feasible", "what shape would the data take".
- You need to *learn*, not *ship* — the output is knowledge and a recommendation.
- Estimation is impossible until something is tried (a feasibility or sizing question).
- A fork in ../../CLAUDE.md or a feature design hinges on an answer no one currently has.

## When NOT to Use

- Comparing a named tool/library against criteria (Neon vs Turso, a chart lib) → use
  `tech-evaluation`, which owns the weighted-criteria matrix.
- Producing performance/throughput numbers under load → use `benchmark-harness`, which
  owns reproducible measurement.
- The unknown is actually a schema-shape question with a known answer → use `schema-design`.
- You already know the answer and just need it built → use `vertical-slice` directly.

## Procedure

1. **Write the learning question first (interrogation: high).** One sentence, falsifiable,
   answerable yes/no or with a concrete artifact. If you can't write it, you don't have a
   spike — you have a feature request. A vague question is the root cause of an endless
   spike. See `references/spike-protocol.md`.
2. **Set the timebox before touching code (interrogation: high).** A hard budget (hours or
   a day), with a named stop condition: "stop at 4h whether or not it works." The cost of
   being wrong here is days of sunk throwaway work. Record the timebox in the memo header.
3. **Mark all output throwaway.** Spike on a `spike/<slug>` branch that will be deleted, or
   a scratch file. Skip the gates (`rule-audit`, `a11y-gate`, `security-pass`) deliberately
   — they apply to production code, and spike code is not that. Note the skip in the memo.
4. **Investigate against the question only.** Resist scope creep: every detour that doesn't
   move the learning question is out of scope and goes in the "NOT explored" list, not the
   code. See `references/memo-template.md` for keeping the boundary visible while you work.
5. **Capture evidence as you go.** Snippets, error messages, the edge-runtime limit you hit,
   the API response you got. The memo's recommendation must be traceable to evidence, not
   recollection.
6. **Write the findings memo (interrogation: medium).** Use the template in
   `references/memo-template.md`: question, timebox actual-vs-budget, what was tried,
   evidence, recommendation, confidence, and the explicit **"What was NOT explored"**
   section. The last is non-optional — it is the spike's main safety output.
7. **Land the decision, delete the code.** If the recommendation resolves a fork in
   ../../CLAUDE.md's abstract defaults, record it in `DECISIONS.md` with date and rationale.
   Delete the spike branch. Hand the recommendation to the skill that builds it.

## Composes With

- **Pairs with:** `tech-evaluation` (a spike may surface a tool worth a full evaluation),
  `benchmark-harness` (a spike may surface a perf question worth real measurement).
- **Feeds:** `vertical-slice` and `schema-design` when the recommendation is "build it",
  and `DECISIONS.md` when it resolves a fork.
- **Hands off:** the throwaway code is deleted, not handed off — only the memo travels.

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project
> conventions). The encoded failure class was confirmed.

**Observed run.** Asked to spike SSE on the edge runtime, the naive agent wrote an ad-hoc
findings doc — no frontmatter, no "What was NOT explored" boundary in the required shape —
and based its recommendation partly on recall rather than an actual deploy + measurement,
leaving the host connection cap, concurrency, and cost explicitly unverified. Worse, the
prototype it offered as the answer carried inviolable-rule violations straight into a
mergeable-looking snippet:

```ts
controller.enqueue(encoder.encode(`data: ${JSON.stringify({ n: i++ })}\n\n`));
// @ts-ignore
controller._interval = interval;     // Rule 1: @ts-ignore + hacky untyped field
// client: const data = JSON.parse(e.data);  // Rule 1: untyped JSON.parse across boundary
```

It also never consulted the existing `edge-runtime-constraints`, `neon-turso-driver`, or
`data-fetching-cache` skills it reasoned about from scratch, and ran no tooling to ground its
claims about the project.

**Failure class (confirmed).** A spike without an enforced learning-question/timebox and a
mandatory throwaway-and-boundary discipline drifts into polished-looking prototype code that
smuggles Rule 1/Rule 2 violations toward merge, while presenting recall-based, unverified
claims as findings and omitting the explicit "NOT explored" boundary that keeps the spike's
gaps from silently becoming production assumptions.

## Examples

- **Input:** "Spike: can we stream LLM tokens through a tRPC subscription on the Vercel edge
  runtime?"
  → **Output:** Learning question + 4h timebox in the memo header; a scratch branch proving
  the edge runtime's WebSocket/streaming limits; evidence (the actual error when opening a
  persistent connection); recommendation ("use HTTP streaming via a Route Handler, not tRPC
  subscriptions"); **NOT explored:** backpressure, auth on the stream, reconnection. Branch
  deleted; a `DECISIONS.md` line added; handed to `vertical-slice`.

- **Input:** "Spike: is UUIDv7 generation viable in our edge functions without a native
  addon?"
  → **Output:** Question + 2h timebox; a pure-JS v7 generator tried against the edge bundle;
  evidence it bundles and runs; recommendation "yes, this library"; **NOT explored:**
  clock-drift collisions under concurrency, sortability guarantees. Feeds `uuidv7-ids`.

- **Input:** "Spike out whether the new design direction feels right." → reframed: this is
  not falsifiable. Either narrow to a question ("does the OKLCH palette pass AA on the dark
  surface?", which is `design-tokens` + `a11y-gate`) or it is not a spike.

## Edge Cases

- **The spike answers the question early** → stop now, write the memo, return the unused
  time. The timebox is a ceiling, not a quota.
- **The timebox expires inconclusive** → that IS a finding. Write the memo with
  recommendation "inconclusive — next step is X" and the confidence as low. Do not extend
  silently; a re-spike is a new question with a new box.
- **The spike code turns out genuinely useful** → do not merge it. Re-build it through
  `vertical-slice` so it passes the gates; the spike proved feasibility, not correctness.
- **The unknown is really a benchmark or a tool comparison** → hand to `benchmark-harness`
  or `tech-evaluation`; a spike answers feasibility, not "which is faster/better."

## References

- `references/spike-protocol.md` — the learning-question and timebox discipline: how to
  phrase a falsifiable question, set a stop condition, and keep spike code throwaway.
- `references/memo-template.md` — the findings-memo template, including the mandatory
  "What was NOT explored" section and the confidence/recommendation framing.

## Scripts

Reserved; empty for now. A generator that scaffolds a dated memo from the template (filling
the question and timebox header) would justify a script once the memo format stabilizes.
