Purpose: how to size an incident by impact (SEV1–3), the low bar to declare, who commands, and the war-room role roster + escalation ladder — the structure decided before the first incident.

# Severity and roles

Two questions a panicked team gets wrong: *how bad is this* and *who is running it*. Decide both
mechanically, in advance, so the answer is not argued mid-outage.

## Severity by impact, not by symptom

Severity is a function of **business/user impact**, never of how alarming the log looks. Size it on
three axes — scope of users affected, data/security exposure, and revenue/contractual impact — and
take the **highest** axis that applies.

| Level | Impact (take the worst axis)                                                                 | Response                                                                 | Public status page? |
|-------|----------------------------------------------------------------------------------------------|--------------------------------------------------------------------------|---------------------|
| SEV1  | Full or near-full outage; data loss/corruption; security breach or data exposure; payments down; all/most users | Page immediately, all-hands, exec/legal notified, war room opened        | Yes — within the first window |
| SEV2  | Major degradation; a key feature down; elevated error rate; a perf cliff; a subset of users; a runaway cost trajectory | On-call + a named IC; war room if it persists; comms lead engaged        | Yes if customer-visible |
| SEV3  | Minor / limited impact; a workaround exists; one tenant; a non-critical feature; cosmetic | Handle in business hours; track; on-call owns it                          | Usually no |

Calibration rules:
- **Declaring is cheap; under-declaring is expensive.** If you are between two levels, pick the
  higher and downgrade later. A SEV2 you downgrade to SEV3 cost minutes; a SEV1 you called a SEV3
  cost the outage.
- **A cost incident is a real incident.** A `spend-cap` tripwire on a runaway trajectory is a SEV2
  (or SEV1 if the burn would exhaust the budget within the day). It gets an IC and a timeline; its
  comms are typically internal.
- **A security/data-exposure event is a SEV1 by default** — even one affected user — because the
  blast radius and legal/privacy obligations are not yet known. On this stack the usual root cause
  is a `protectedProcedure` missing its ownership check (Rule 2, the #1 vulnerability class).

## Who declares vs who commands

- **Anyone can declare.** The bar is intentionally low — an engineer, support, or an automated
  alert. You never need permission to declare; you need permission to *not* respond.
- **Exactly one person commands.** The **Incident Commander (IC)** owns the incident end to end.
  The first responder *is* the IC until they explicitly hand off. The IC is a *role*, not a rank —
  it is often not the most senior person and usually not the person with hands on the keyboard.

The IC **coordinates and decides; they do not debug.** The single most common failure is the only
person who understands the system trying to also run comms, track the timeline, and make the call.
If the IC finds themselves heads-down in a stack trace, they have silently abandoned the role —
hand it off.

## War-room roles

For a SEV1/2, split the work across people. Small teams collapse roles onto fewer humans, but the
*responsibilities* stay distinct and someone owns each.

| Role                | Owns                                                                                  |
|---------------------|---------------------------------------------------------------------------------------|
| Incident Commander  | The decision, the severity, delegation, when to escalate, when to declare resolved    |
| Operations / Tech lead | Investigation and applying mitigations (the hands on the keyboard)                  |
| Communications lead | Customer comms, the status page, stakeholder/exec updates, privacy/legal liaison      |
| Scribe              | The **UTC-timestamped** timeline (Rule 6): every action, decision, and observation     |

One channel is the single source of truth. Decisions and actions go *there*, timestamped, so the
post-mortem timeline writes itself and nobody re-litigates "when did we roll back?"

## Escalation ladder

- **Tier 1 — primary on-call.** Receives the page, triages, declares, takes initial IC.
- **Tier 2 — secondary / domain owner.** Paged when the primary cannot mitigate within the
  agreed window, or when the incident spans a domain they don't own.
- **Tier 3 — engineering lead / exec + legal/privacy.** Paged for any SEV1, any security/data
  exposure, or any incident crossing the customer-comms or contractual threshold.

Each tier has an explicit *time-to-escalate* — if Tier 1 has not mitigated within N minutes,
Tier 2 is paged automatically rather than waiting for someone to remember. The ladder routes to a
*watched* channel (PagerDuty / on-call rotation), never an unread inbox — the same discipline
`spend-cap` requires of its billing alerts.
