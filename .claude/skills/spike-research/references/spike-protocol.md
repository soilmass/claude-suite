Purpose: the discipline that makes a spike end — a falsifiable learning question, a hard timebox with a stop condition, and the throwaway-code rule.

# Spike protocol

A spike trades correctness for speed to answer ONE question. Everything below exists to stop
a spike from becoming an open-ended, half-built feature.

## 1. The learning question

Write it before any code. It must be:

- **Singular** — one unknown. "Can the edge runtime stream tokens?" not "how should we do
  realtime?"
- **Falsifiable** — answerable yes/no or with a concrete artifact you'll point at. If the
  answer is an opinion, it is not a spike.
- **Decision-linked** — name the decision it unblocks. A spike with no downstream decision
  is curiosity, not a spike; defer it.

Smell test — these are NOT spike questions:
- "Look into X" (no end condition).
- "Make X nice / feel right" (not falsifiable → design work).
- "Which of A or B is better/faster" (→ `tech-evaluation` / `benchmark-harness`).

## 2. The timebox

- A **hard ceiling** in hours or one day, written in the memo header before starting.
- A **stop condition**: "stop at 4h whether or not it works." Expiry is a valid outcome —
  inconclusive is a finding, not a failure.
- The box is a ceiling, not a quota: if the question is answered in 1h, stop and return the
  time.
- Inconclusive at expiry → do NOT extend silently. A re-spike is a NEW question with a new
  box, decided deliberately.

## 3. Throwaway code rule

Spike code is not production code and is never merged.

- Work on a `spike/<slug>` branch (deleted after) or a scratch file outside `src/`.
- Skip the gates on purpose — `rule-audit`, `a11y-gate`, `security-pass` apply to code that
  ships; spike code does not. `any`, no ownership checks, hardcoded values are all fine *in
  a spike* because the artifact is the knowledge, not the code. Note the deliberate skip in
  the memo so no one mistakes the branch for reviewed work.
- If the spike proves something worth building, it is rebuilt through `vertical-slice` /
  `schema-design` so it passes the nine rules in ../../CLAUDE.md. Feasibility proven is not
  correctness proven.

## 4. Scope-creep guard

Anything that does not move the learning question is out of scope. Do not build it — write
it on the "What was NOT explored" list in the memo. Common edge-stack detours that belong on
that list, not in the spike:

- Auth / ownership (Rule 2) on the spiked path.
- Error and empty states (Rule 4).
- Scale, concurrency, backpressure, rate limits.
- Type-chain integrity (Rule 1), Zod-validated boundaries (Rule 8).
- Cost / log-volume implications at the edge.

Listing these is the spike's safety output: it tells the next reader exactly which
assumptions are still unverified.
