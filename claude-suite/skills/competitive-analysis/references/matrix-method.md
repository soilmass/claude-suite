Purpose: how to pick comparison criteria, score them, and lay out the matrix + verdict so a competitive analysis is symmetric, scannable, and decision-ready.

# Criteria selection

Fix the axes *before* looking at any competitor. Axes chosen after seeing a leader bend
the whole matrix toward that leader (selection bias). Record the final axis set and any
weighting in `DECISIONS.md`.

A serviceable default axis set — trim and extend per domain:

- **Core capability** — does it do the primary job, and how deeply.
- **Pricing model** — tier structure, unit (seat/usage/flat), free tier, overage.
- **Target segment** — indie / SMB / mid-market / enterprise.
- **Integration surface** — APIs, SDKs, webhooks, marketplace.
- **Stack/runtime fit** — for this suite, edge-runtime compatibility, App Router /
  serverless SDK support, no long-lived TCP requirement (see `../../CLAUDE.md` spine).
- **Hard limits** — rate limits, row/object caps, regions, data residency.
- **Operational posture** — SLA, status history, support channels, lock-in / export path.
- **Trajectory** — recent release cadence, funding/ownership, deprecations.

Rules:
- Every competitor is scored on **every** axis. A blank cell is a finding ("opaque",
  "not offered"), never a silent omission.
- Keep axes orthogonal. If two axes always move together, merge them.
- Weight axes only if the decision demands it, and record the weights — an unweighted
  matrix is honest; a silently weighted one is not.

# Scoring scale

Pick one scale and use it for the whole matrix. Recommended:

- **Verdict + marker:** each cell is a short verdict phrase plus a citation marker into
  the claim ledger, e.g. `MoR, handles tax [P-3]` or `opaque — contact sales [L-7]`.
- Optional ordinal overlay for scannability: `++ / + / ~ / − / −−` or `✓ / partial / ✗`.
- Avoid bare numeric 1–10 scores; they imply a precision the sources rarely support.

Mark **confidence** on any cell that drives the decision: `verified` (primary source or
hands-on) vs `asserted` (vendor claim, unverified). See `source-discipline.md`.

# Matrix layout

Competitors as **columns**, criteria as **rows**. Your own product is a column too — the
point is relative position, not a competitor catalogue.

```
| Criterion            | Us            | Stripe        | Lemon Squeezy   | Paddle          |
|----------------------|---------------|---------------|-----------------|-----------------|
| Edge SDK support     | ++ native     | + adapter [S2]| ~ REST only [L1]| ~ REST only [P1]|
| Pricing model        | usage [D-us]  | usage [S3]    | flat+fee [L2]   | MoR % [P2]      |
| Tax handling         | − manual      | + Tax add-on  | ++ MoR [L4]     | ++ MoR [P4]     |
| Webhook model        | + signed [D]  | ++ signed [S5]| + signed [L5]   | + signed [P5]   |
| Hard limits          | n/a           | rate [S6]     | opaque [L6]     | opaque [P6]     |
| As of                | 2026-06-26    | 2026-06-26    | 2026-06-26      | 2026-06-26      |
```

Bracketed markers (`[S2]`, `[L1]`) point into the claim ledger row that carries the URL,
source type, and access date. The matrix stays readable; the evidence lives in the ledger.

# Verdict template

Prose exists only to explain the matrix. Write it asymmetrically:

```
## Verdict (as of <date>, re-verify by <date>)

Where we win:   <axes where our column leads, with the why>
Where we lose:  <axes where a rival leads, honestly>
Where it's moving: <trajectory signal — who is shipping fastest, category drift>
Call:           build / adopt / partner / hold — one sentence, decision recorded in DECISIONS.md
Strongest counter-argument: <the best case against our own call>
Open questions: <unverified claims gating the decision; assign to hands-on check>
```

The "strongest counter-argument" line is mandatory — a competitive analysis that cannot
state the case against its own conclusion has not actually weighed the field.
