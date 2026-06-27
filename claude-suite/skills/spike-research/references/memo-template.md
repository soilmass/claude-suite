Purpose: the spike memo template — the only artifact a spike produces — with the mandatory "What was NOT explored" boundary and a confidence-graded recommendation.

# Spike memo template

The memo is the spike's single deliverable. The code is deleted; the memo is what travels.
Keep it short — a spike that needs a long memo was probably too broad.

## Template

```md
# Spike: <one-line learning question>

- Date: <YYYY-MM-DD>
- Timebox: <budget, e.g. 4h>  | Actual: <spent>  | Stop condition: <hit / early / expired>
- Spike branch: spike/<slug> (deleted)  | Gates skipped: deliberate (throwaway code)

## Question
<The single falsifiable question, verbatim from the protocol.>

## What was tried
<Bullet log of approaches, in order. Enough for someone to reproduce the path, not the code.>

## Evidence
<Concrete artifacts: error messages, the edge-runtime limit hit, the API response shape,
the bundle size, the snippet that worked. The recommendation must trace to THIS section.>

## Recommendation
<One clear call: build it this way / don't / inconclusive — next step is X.>

## Confidence: <high | medium | low>
<Why this confidence. Low is honest and useful; an inconclusive spike is still a result.>

## What was NOT explored   <- mandatory
<Every assumption left unverified. This is the safety output. If empty, the spike was
either trivial or dishonest. Typical entries on the edge stack:>
- Auth / ownership (Rule 2) on the spiked path — not touched.
- Error / empty / loading states (Rule 4) — happy path only.
- Scale, concurrency, backpressure, edge cold-start cost.
- Type-chain integrity (Rule 1) and Zod boundaries (Rule 8) — bypassed for speed.

## Next step
<Hand to: vertical-slice / schema-design / tech-evaluation / benchmark-harness — and, if a
fork in ../../CLAUDE.md's abstract defaults was resolved, the DECISIONS.md line to add.>
```

## Why "What was NOT explored" is mandatory

The single most damaging spike outcome is not a wrong answer — it is an *unbounded* answer.
A memo that lists only what worked invites the team to assume the untouched parts (auth,
scale, error paths) were validated. They were not. Naming the gaps converts silent
assumptions into visible, owned follow-ups. A memo without this section is not done.

## Recommendation framing

- **Build it** -> name the approach and hand to `vertical-slice` (or `schema-design` if the
  finding is data-shape). The build re-earns the nine rules; the spike only proved feasible.
- **Don't** -> name the blocker (the concrete edge-runtime limit, the cost, the missing API).
- **Inconclusive** -> state the single next step and set confidence low. Do not quietly
  re-open the box; a re-spike is a fresh, deliberately-budgeted question.

## DECISIONS.md

If the spike resolved a fork the source of truth states only in the abstract (e.g. "a
serverless driver" -> "Neon serverless, because the spike proved it bundles at the edge"),
record it in `DECISIONS.md` with the date and a one-line rationale, per ../../CLAUDE.md.
