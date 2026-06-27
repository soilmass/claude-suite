Purpose: the claim ledger format and the sourcing rules that make every cell in a competitive analysis dated, attributed, and re-verifiable.

# The claim ledger

Every assertion in the matrix traces to one ledger row. The ledger is the audit trail;
the matrix is the summary. Never put a claim in the matrix that has no ledger row.

| Ref  | Competitor   | Axis          | Claim                          | Status   | Source type      | URL                          | Accessed   | Confidence |
|------|--------------|---------------|--------------------------------|----------|------------------|------------------------------|------------|------------|
| P-4  | Paddle       | Tax handling  | Acts as merchant of record     | observed | vendor docs      | paddle.com/docs/...          | 2026-06-26 | verified   |
| L-1  | Lemon Squeezy| Edge SDK      | REST API only, no edge SDK     | observed | vendor docs      | docs.lemonsqueezy.com/...    | 2026-06-26 | verified   |
| S-3  | Stripe       | Pricing       | 2.9% + 30¢ per successful card  | asserted | vendor pricing   | stripe.com/pricing           | 2026-06-26 | verified   |
| L-6  | Lemon Squeezy| Hard limits   | No published rate limit        | asserted | absence of doc   | (searched docs, none found)  | 2026-06-26 | low        |

Required columns: **Status**, **Source type**, **URL**, **Accessed date**, **Confidence**.
A row missing the URL or the access date is not a citation — it is a rumor.

# Observed vs asserted

The single most important distinction in the whole artifact.

- **Observed** — you verified it yourself: read it in primary docs, saw it in the product,
  ran a hands-on test, hit the API. State *how* you observed it.
- **Asserted** — someone claims it: a vendor marketing page, a sales rep, a third-party
  roundup. Reproducing an assertion as fact is the core failure this skill prevents.

Marketing language is asserted until verified. "Unlimited", "enterprise-grade",
"lightning-fast", "fully edge-native" are claims, not facts — verify against docs or a
hands-on check before any such phrase enters the matrix as a verdict.

# Source-type ranking

Prefer higher-trust sources for decision-driving cells. From most to least authoritative:

1. **Hands-on test / API call** — you exercised it. Highest confidence.
2. **Primary docs / changelog / status page** — the vendor's own technical record.
3. **Vendor pricing / product pages** — authoritative for pricing, marketing-shaded for
   capability claims.
4. **Reputable third-party review or benchmark** — useful, but check its own date.
5. **Comparison blogs / listicles** — lowest; often stale, often SEO-driven, frequently
   wrong on pricing and limits. Never let one drive a decision-grade cell.

Rule: any cell that flips the decision (pricing, hard limits, "supports X") must rest on
tier 1–3. Tier 4–5 sources mark a cell `asserted / low` and flag it for verification.

# Dating and re-verification

Competitor facts perish — pricing changes, limits change, products get acquired or sunset.

- Every ledger row carries an **access date**. Every matrix column carries an "as of" row.
- The artifact header states `as of <date>, re-verify by <date>` (default horizon: one
  quarter for fast-moving categories, six months for stable ones).
- When a standing comparison doc needs ongoing freshness, hand re-verification to
  `perishable-refresh` — it re-checks dated specifics against current sources and proposes
  updates rather than rewriting silently.

# Competitor-set integrity

- State who is **in**, who is **out**, and the one-line reason for each exclusion
  (out-of-segment, dead project, acquired, white-label of another entry).
- Omitting the obvious market leader discredits the whole analysis — if a leader is
  excluded, the exclusion must be justified in writing.
- Flag relationships (acquisitions, OEM/white-label) so two badges of the same underlying
  product are not counted as two independent rivals.
