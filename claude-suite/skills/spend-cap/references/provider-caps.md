Per-provider spend-cap and billing-alert wiring for the edge stack — what each provider meters on, how to set a hard cap, and how to set alerts. Pricing tiers perish; re-verify with `perishable-refresh`.

## The metered surfaces (inventory this first — Procedure step 1)

| Provider | Billing unit(s) | Hard cap mechanism | Alert mechanism |
| --- | --- | --- | --- |
| Vercel (hosting) | Function invocations, function duration / fluid-compute GB-hours, edge requests, fast data transfer (bandwidth), ISR/image optimizations | **Spend Management** (set amount + action: notify or **pause project**) | Usage notifications at % thresholds |
| Neon (Postgres driver) | Compute (CU-hours), storage (GB-month), data transfer, written/extra branches | **Consumption / billing limit** on the project (paid plans) | Billing + usage alerts |
| Turso / libSQL (driver) | Rows read, rows written, storage, number of databases | Plan quota ceilings (per-org); overage behavior is plan-defined | Usage dashboard + plan-limit notices |
| Sentry (observability) | Events: errors, transactions/spans, replays, attachments, cron monitors | **Spend cap** (on-demand / pay-as-you-go budget = $0 caps overage) + **spike protection** | On-demand budget % + spike-protection notifications |
| Clerk (auth) | Monthly Active Users (MAU) / Monthly Active Orgs | Plan MAU ceiling; overage is per-MAU on paid plans | Usage dashboard |

The non-obvious edge drivers: **Vercel function invocations** (a recursive or crawler-hit
route runs them unbounded) and **DB rows-read** (a missing index — Rule 7 / `index-strategy` —
multiplies reads per request). These, not bandwidth, are the usual surprise.

## Vercel — Spend Management (the primary hosting cap)

- Project/Team → Settings → **Billing → Spend Management**. Set the monthly amount to the
  Production budget slice from `budget-by-environment.md`.
- Choose the action at the limit:
  - **Pause Project** — hard stop; production goes offline but the bill stops. Use when an
    unbounded bill is worse than downtime (most pre-revenue products).
  - **Notify only / webhook** — fires a webhook you can wire to a kill switch or page; use
    when downtime is unacceptable but you still want the tripwire.
- Add **Usage Notifications** at the ladder percentages (see `budget-by-environment.md`).
- Preview deploys bill against the same team usage — cap preview separately (limit preview
  concurrency, pin previews to a smaller DB branch); do not let every PR spin uncapped compute.

## Neon — consumption / billing limit

- Console → Project → **Billing / Settings → Consumption limits**: cap compute (CU-hours) and
  storage so an idle-but-not-suspended branch or a runaway query batch cannot run all month.
- Keep **autosuspend** (scale-to-zero) short for non-prod branches so preview/dev compute
  parks when idle — the cheapest cap is not running.
- Set billing alerts at the ladder thresholds; route to the on-call channel.

## Turso — plan quota + usage alerts

- Turso bills/limits per-organization on rows read, rows written, storage, and DB count.
- There is no per-project "pause" like Vercel — the lever is the **plan ceiling**: pick a plan
  whose included quota is your cap, and watch usage alerts; for overage-enabled plans, set the
  tightest alert ladder and a manual runbook (Edge Case: provider with no hard cap).
- Use separate databases (or `--db` branches) per environment so preview/dev rows-read is
  attributable and cappable, not pooled into production's number.

## Sentry — spend cap + spike protection

- Settings → **Subscription / Spend caps**: set the **on-demand (pay-as-you-go) budget**. A
  budget of `$0` means events beyond the reserved quota are dropped rather than billed — the
  hardest cap. A non-zero budget is the overage ceiling.
- Enable **spike protection** so a sudden error storm is rate-limited at ingest instead of
  billed per-event.
- Set **per-project rate limits / sampling** for high-volume projects. The *trace* sample rate
  itself is wired by `observability-setup`; this is the ingest-side backstop.

## Clerk — MAU ceiling

- Clerk bills on MAU above the free allotment. There is no spend "cap" that blocks sign-ins
  (you do not want to lock users out), so the control is an **alert** on MAU trend plus a plan
  chosen with headroom. Watch MAU growth; treat a spike as a possible abuse signal, not just
  cost (hand abuse questions to `security-pass`).

## Secrets note (Rule 9)

Any billing/usage **API token** used by a cap-checking script or webhook is a server-only
secret — never a `NEXT_PUBLIC_*` var, never in a Client Component. Validate it through the Zod
env boundary (`env-validation`, Rule 8).
