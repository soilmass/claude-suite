Per-environment budget allocation, the graduated alert ladder with routing, and the cap-vs-throttle tradeoff. Numbers are templates — set real figures in `DECISIONS.md`.

## Per-environment budget split

Each of Production / Preview / Development gets its own cap. Preview and Development are
scoped down hard — an uncapped preview env behind every PR is a production-sized bill waiting
for a busy sprint. A representative split of a monthly budget `B`:

| Environment | Share | Rationale | Tightening levers |
| --- | --- | --- | --- |
| Production | ~80% of `B` | Real traffic; the slice that must not go offline carelessly | Spend Management amount, DB consumption limit |
| Preview | ~15% of `B` | One ephemeral deploy per open PR; bursty, short-lived | Limit concurrency, pin to a small DB branch, short autosuspend |
| Development | ~5% of `B` | Local + shared dev; mostly idle | Smallest DB branch, scale-to-zero, no paid add-ons |

Record the actual amounts, the owner of the budget review, and the review cadence in
`DECISIONS.md`. Re-verify against current provider pricing with `perishable-refresh` before
trusting an old allocation (free-tier quotas move).

## The graduated alert ladder (not a single 100% tripwire)

A single hard cap at 100% means you learn about the trend from the outage it causes. Use a
ladder so a human acts on the slope, not the wall:

| Rung | Threshold | Meaning | Action |
| --- | --- | --- | --- |
| Warn | ~50% | On pace but early in the period? Check the date. | Note it; no action if mid-month. |
| Investigate | ~80% | Likely to exceed | Find the driver (invocations? rows-read? events?), throttle the knob |
| Cap | ~100% | Hard limit | Provider pause / on-demand budget exhausted; incident |

Set these as usage notifications on **every** provider from `provider-caps.md`, not just Vercel.

## Alert routing (Rule: a human must watch the channel)

- Route every rung to a **watched** channel: on-call Slack, PagerDuty, or a shared inbox with
  an owner — never the project owner's personal unread email.
- The 80% and 100% rungs should page, not just post.
- **Verify delivery** (Procedure step 5): trigger a test notification or briefly lower a
  threshold and confirm it lands. An untested alert is decorative.

## Cap vs throttle — the tradeoff at the top rung

- **Hard pause/cap** (Vercel Pause Project, Sentry $0 on-demand): production may go offline,
  but the bill stops. Default for pre-revenue products — an outage is recoverable, an unbounded
  invoice is not.
- **Throttle / notify-only**: keep serving, fire a webhook to a kill switch or page. Use when
  downtime is unacceptable — but then the warn/investigate rungs must be low enough that a human
  intervenes well before the cap would fire.

State which mode each provider is in, and why, in `DECISIONS.md`.

## The cap is a backstop — the real spend control is upstream

The biggest edge bills come from volume knobs, not hosting tiers. Confirm the owners set them:

- **Trace sample rate** — `observability-setup` wires `tracesSampleRate` from env; it must be
  fractional, never `1.0`. Unsampled spans are a top Sentry-event driver.
- **Log volume / level / sampling** — `log-discipline` owns what and how much to log; per-request
  bodies and PII logging are the top edge cost driver per the spine.
- **Rows read** — a missing index (Rule 7, `index-strategy`) or an N+1 (`n1-hunter`) multiplies
  DB reads per request; fix the access pattern, don't just raise the cap.

The cap stops the catastrophe; these knobs stop the slow bleed. Set both.
