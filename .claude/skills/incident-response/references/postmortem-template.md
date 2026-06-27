Purpose: a fill-in blameless post-mortem template and the framing that keeps it honest — systemic factors over individual blame, with action items that are owned, dated, and tracked to done.

# Blameless post-mortem

A post-mortem exists to make the *system* safer, not to find who to blame. The blameless rule is
not politeness — it is what keeps people willing to report and reconstruct what actually happened.
The moment a post-mortem can punish, people hide the truth and you lose the data.

## The blameless framing

- **"Human error" is never a root cause** — it is the *first question*: why did the system let a
  competent person, acting reasonably with the information they had, cause or miss this? A missing
  guardrail, a confusing UI, an absent test, an alert that didn't fire — those are the findings.
- **Assume good faith and reasonable action.** Reconstruct decisions from what the person knew *at
  the time*, not with hindsight. "They should have known" is hindsight bias, not analysis.
- **Counterfactuals are weak.** "If only X had checked Y" describes a wish, not a fix. Replace
  every counterfactual with a systemic change that makes the failure mode harder next time.
- **Every SEV1/2 gets one**, within a fixed window (e.g. 5 business days). Closing the incident
  without it is leaving the most valuable artifact on the table.

## Template

```markdown
# Post-mortem: <short incident title>

- **Severity:** SEV<1|2|3>
- **Status:** <Draft | Reviewed | Closed>
- **Incident Commander:** <name>
- **Authors:** <names>
- **Date of incident:** <YYYY-MM-DD>   **Post-mortem date:** <YYYY-MM-DD>

## Summary
<2–4 sentences in plain language: what broke, who was affected, how long, how it was mitigated.>

## Impact
- **Users affected:** <count / % / segment>
- **Duration:** detected <UTC> → mitigated <UTC> → resolved <UTC>
- **Data / security:** <none | exposure scope | corruption scope>
- **Revenue / SLA:** <estimate, or n/a>

## Timeline (UTC — Rule 6)
| Time (UTC) | Event |
|------------|-------|
| HH:MM | <first signal — alert fired / report received> |
| HH:MM | Declared SEV<n>; <name> took IC |
| HH:MM | Mitigation: <rollback / flag off / failover> applied |
| HH:MM | First customer comms posted |
| HH:MM | Recovery confirmed; status → Monitoring |
| HH:MM | Resolved |

## Detection
<How was it detected — alert, customer, internal? How long from start to detection? Should a
signal have caught it sooner? That gap is an action item.>

## Root cause & contributing factors
<The technical root cause, then the systemic contributing factors via 5-whys. Stop at a systemic
factor you can change, not at a person. On this stack a data-exposure incident's root cause is
typically a protectedProcedure missing its ownership check — Rule 2.>

## What went well
<Genuine strengths — fast rollback, clear comms, a flag that existed. Name them so they're kept.>

## What went poorly / where we got lucky
<Honest gaps. "We got lucky that X" is a finding: luck is not a control.>

## Action items
| # | Action (specific, verifiable) | Owner | Due | Tracking | Status |
|---|-------------------------------|-------|-----|----------|--------|
| 1 | <e.g. add ownership check + cross-tenant denial test> | <name> | <YYYY-MM-DD> | <issue link> | Open |
| 2 | <e.g. add the alert that would have detected this sooner> | <name> | <YYYY-MM-DD> | <issue link> | Open |

## Lessons
<What this changes about how we build/operate. The durable takeaway.>
```

## Action-item discipline (the part that's usually theater)

- **Specific and verifiable.** "Improve monitoring" is not an action item; "add a p95-latency alert
  on the checkout route at >800ms" is.
- **One named owner.** Not a team — a person. Shared ownership is no ownership.
- **A due date and a tracking link.** It lands in the same backlog as feature work and is reviewed
  to completion, not filed and forgotten.
- **Routed to the owning skill.** A code fix → `vertical-slice`; a schema change → `migration-author`;
  a security gap (ownership check, headers) → `security-pass`; a cost/sampling gap →
  `observability-setup` / `log-discipline`; a non-obvious decision → recorded in `DECISIONS.md`.

A post-mortem whose action items are still all "Open" three months later did not happen. Track them.
