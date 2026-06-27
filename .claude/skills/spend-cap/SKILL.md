---
name: spend-cap
description: >
  Set hard spend caps and graduated billing alerts across every metered surface of the
  edge stack — Vercel hosting (invocations, function duration, fluid compute, bandwidth),
  the serverless DB (Neon compute/storage or Turso rows-read/written), Sentry event volume,
  and Clerk MAUs — and allocate a budget per environment (Production / Preview / Development)
  before launch, not after the bill arrives. Wires the provider tripwires and the alert
  ladder so a runaway loop pages a human instead of silently invoicing.
  Use when: "spend cap", "budget alert", "cost control", "cap spending", "billing alert".
  Do NOT use for: log volume / sampling / what to log to control cost (use log-discipline),
  wiring OTel + Sentry instrumentation itself (use observability-setup).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the "launched with no cap, found out via the invoice"
    failure class: no provider spend limit, alerts to nowhere, one budget for all envs,
    preview deploys metered as production.
    Baseline section is the encoded failure class; replace with an observed transcript.
---

# spend-cap

Set the spend caps and billing alerts the spine (`../../CLAUDE.md`, "a spend cap is set
before launch, not after the bill") mandates — across hosting, DB, observability, and auth,
per environment. This skill owns the *limits and alerts*; what you log and how hard you
sample (the levers that move the bill) belong to `log-discipline` and the sample-rate knob
`observability-setup` wires.

---

## Non-Negotiable Rules
- **Never launch without a hard cap on every metered provider.** Vercel Spend Management,
  the DB consumption limit, and the Sentry on-demand/spend cap are set *before* the first
  production traffic — a cap added "after we see the numbers" is added after the bill.
- **Never point a billing alert at a channel no human watches.** Alerts route to an on-call
  inbox / Slack / PagerDuty, not to the project owner's unread email. An unseen alert is no
  alert.
- **Never give Preview and Development the Production budget.** Each environment gets its own
  cap; an uncapped preview env behind every PR is a back-door to a production-sized bill.
- **Never set a single 100% tripwire.** Use a ladder (warn → throttle → cap) so you act on a
  trend, not on the outage the hard cap causes.

Refuse these rationalizations: "we'll add the cap once we know real usage" · "the alert
emails me, that's enough" · "preview is just us, it doesn't need a cap" · "one limit at 100%
is simpler."

---

## When to Use
- Pre-launch hardening: setting Vercel Spend Management + usage notifications before go-live.
- Capping the serverless DB (Neon compute/storage consumption limit, or Turso plan limits).
- Setting the Sentry spend cap / on-demand budget and per-project spike protection.
- Allocating a per-environment budget (Production / Preview / Development) and the alert ladder.

## When NOT to Use
- Deciding what to log, log levels, or sampling to *reduce* the bill → `log-discipline`.
- Wiring the OTel/Sentry instrumentation and the `tracesSampleRate` knob → `observability-setup`.
- A runtime cost blowup from a Node API forcing a route off the edge → `edge-runtime-constraints`.
- The CI performance budget (LCP/INP/CLS) — a different "budget," deterministic in CI, not here.

---

## Procedure

1. **Inventory the metered surfaces and their cost drivers first (medium cost).** You cannot
   cap what you have not listed. Enumerate every billed provider — Vercel, the DB driver
   (`neon-turso-driver`), Sentry, Clerk — and the *unit* each bills on (invocations, GB-hours,
   rows read, events, MAUs). The edge stack's drivers are non-obvious. See
   `references/provider-caps.md`.

2. **Set a hard spend cap on each provider (high cost — this is the tripwire).** Vercel Spend
   Management with a pause action; the DB consumption limit; the Sentry spend cap with spike
   protection. The cap is the floor that stops a runaway loop from running all month. Exact
   settings per provider in `references/provider-caps.md`.

3. **Build the per-environment budget (high cost — wrong split leaks money).** Allocate the
   monthly budget across Production / Preview / Development; Preview and Development must be
   scoped down hard. Use the budget table in `references/budget-by-environment.md`; record the
   numbers and rationale in `DECISIONS.md`.

4. **Wire the graduated alert ladder, not a single tripwire (medium cost).** Set usage
   notifications at ~50% (warn), ~80% (investigate / throttle), ~100% (cap fires). Each
   threshold routes to a watched channel. The ladder and routing are in
   `references/budget-by-environment.md`.

5. **Verify alerts actually deliver (medium cost — an untested alert is decorative).** Trigger
   a test notification or lower a threshold momentarily and confirm it lands in the on-call
   channel. A billing alert nobody receives is the failure this skill exists to prevent.

6. **Cross-check the cost-driving knobs with the owning skills (low cost, high leverage).** The
   biggest edge bills come from sampling and logging, not hosting. Confirm `observability-setup`
   set a fractional `tracesSampleRate` and `log-discipline` set sampling/level discipline — the
   cap is the backstop, those knobs are the actual spend control. See `references/budget-by-environment.md`.

7. **Record the caps, budgets, and owner in `DECISIONS.md` (low cost).** Caps drift and the
   numbers perish; note who owns the budget review and when it is revisited. `perishable-refresh`
   re-checks provider pricing tiers since they date.

---

## Composes With
- **Consumes:** `neon-turso-driver` (which DB provider and plan you are capping), `t3-genesis`
  (the deployed project + environments the caps attach to).
- **Pairs with:** `log-discipline` (owns log volume / sampling — the top edge cost driver this
  cap backstops), `observability-setup` (owns the trace sample-rate knob the budget must respect).
- **Hands off:** `perishable-refresh` when provider pricing tiers or free-quota limits have
  shifted and the budget numbers need re-verifying; `edge-runtime-constraints` when a cost spike
  traces to a route that fell off the edge runtime.

---

## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)
> Encoded failure class, not a captured transcript; replace once observed in the wild.

**Failure class encoded:** Asked to "get us ready to launch," the agent ships the deploy and
never touches billing. Concrete defects that ship: (1) no Vercel Spend Management cap, so a
recursive `fetch` or a crawler runs function invocations unbounded for a full billing period;
(2) the DB has no consumption limit, so a missing index (Rule 7 / `index-strategy`) drives
rows-read past the plan into overage; (3) Sentry left at default with no spend cap or spike
protection, so an error storm bills per-event without limit; (4) one budget covering all
environments, with every preview deploy behind every PR metered like production; (5) the only
"alert" is the provider's default email to an unmonitored owner inbox, seen days after the
spend. The team learns the numbers from the invoice — exactly what the spine forbids.

---

## Examples

**Input:** "We launch next week — set up cost controls."
**Output:** Inventories Vercel / Neon / Sentry / Clerk and their billing units. Sets Vercel
Spend Management at the production budget with auto-pause, a Neon consumption limit on
compute + storage, a Sentry spend cap with spike protection on. Allocates a per-environment
budget (Prod 80% / Preview 15% / Dev 5%) with a 50/80/100% alert ladder routed to the on-call
Slack channel, fires a test alert to confirm delivery, and records the caps + owner in
`DECISIONS.md`.

**Input:** "Our preview deploys are costing as much as production."
**Output:** Scopes Preview to its own budget slice, caps preview function concurrency / pins
preview to a smaller DB branch, and adds a preview-specific usage alert. Notes that the real
driver may be unsampled traces in preview — hands the sample-rate fix to `observability-setup`
and logging volume to `log-discipline`.

**Input:** "Add a billing alert before we forget."
**Output:** Wires the 50/80/100% ladder on each provider, routes every threshold to the
watched on-call channel (not the owner inbox), and verifies delivery with a test notification.

---

## Edge Cases
- **A provider has no hard cap, only alerts (e.g. usage-based with no pause)** → set the
  tightest alert ladder available and add an automation/kill-switch hook on the 100% alert;
  record the gap and its manual runbook in `DECISIONS.md`.
- **The hard cap would take production offline if hit** → keep the cap (an outage is recoverable,
  an unbounded bill is not) but set the warn/throttle rungs low enough that a human intervenes
  long before the cap fires.
- **Cost spike is from trace/log volume, not hosting** → the cap caught it, but the fix lives in
  `observability-setup` (sample rate) and `log-discipline` (what/how much to log), not here.
- **Free-tier quotas changed since you set the budget** → numbers perished; run
  `perishable-refresh` against provider pricing before trusting the old allocation.

---

## References
- `references/provider-caps.md` — per-provider cap + alert wiring for the edge stack: Vercel
  Spend Management, Neon/Turso consumption limits, Sentry spend cap + spike protection, Clerk
  MAU limits, and the billing unit each meters on.
- `references/budget-by-environment.md` — the per-environment budget table, the 50/80/100%
  alert ladder with routing, the cap-vs-throttle tradeoff, and the cross-reference to the
  cost-driving knobs owned by `log-discipline` and `observability-setup`.

## Scripts
`scripts/` reserved. A checker that queries each provider's billing API for a configured spend
cap and a non-default alert threshold — failing the pre-launch gate when any surface is
uncapped — would justify one once the provider set stabilizes across projects. Empty for now.
