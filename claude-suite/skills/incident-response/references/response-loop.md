Purpose: the detect → triage → mitigate → communicate → resolve loop run during a live incident, the mitigate-before-root-cause rule, holding-statement templates, and the status-page state machine and cadence.

# The response loop

Run the loop, not a scramble. Each phase has an owner and an exit condition; you cycle until
resolved.

```
detect ──▶ triage ──▶ mitigate ──▶ communicate ──▶ resolve
              ▲            │             │
              └────────────┴─────────────┘   (re-loop: new info → re-triage, re-mitigate, update)
```

## Detect

A signal arrives: an `observability-setup` alert (error-rate spike, latency cliff, a Sentry
issue), a `spend-cap` tripwire, or a human report. Capture the first timestamp (UTC, Rule 6) — it
anchors the timeline and the "time to detect" metric.

## Triage

Assess impact on the three axes (see `severity-and-roles.md`), assign SEV1/2/3, **declare**, and
the first responder takes IC. Page the roles the severity demands. Triage is fast and reversible —
you can re-triage as the picture sharpens.

## Mitigate — *before* root cause

**This is the rule the whole skill exists to enforce.** The goal of mitigation is to restore users,
not to understand the bug. Reach for the fastest *safe* action:

- **Roll back** the bad deploy → `rollback-runbook` (pointer-based promote of the prior build is
  seconds; this is usually the first move). If the deploy crossed a destructive contract boundary,
  `rollback-runbook`'s check decides whether reversal is safe or must hand to `disaster-recovery`.
- **Flip a feature flag off** to disable the broken path without a deploy.
- **Fail over / shed load / scale** for a capacity or upstream-vendor event.
- **Cut access** for a security/data-exposure event — stop the leak before diagnosing it.

Only once users are recovered (or the bleeding is stopped) do you move to diagnosis. Diagnosis is
the *post-mortem's* job, not the outage's. "We don't fully understand it yet but the rollback fixed
it" is a successful mitigation, not a loose end.

## Communicate

For any customer-visible SEV1/2 the comms lead posts **early** — within the first window (target
≤15 min for SEV1) — even with nothing diagnosed. A holding statement has four parts and nothing
else:

1. **Acknowledge** — we are aware of an issue.
2. **Impact** — what users are experiencing (in their terms, not internal jargon).
3. **Action** — that we are actively working on it.
4. **Next update** — a committed time.

**Never** in a public statement: a root-cause guess, blame, an internal hostname/service name, a
credential, a stack trace, or any customer PII (Rule 9 / `log-discipline`). When in doubt, say
less — you can add detail later, you cannot retract a leak.

### Holding-statement templates

```
[Investigating] We're investigating reports of <user-visible symptom>. Some users may be
unable to <action>. We're working to restore service and will post an update by <UTC time>.

[Identified] We've identified the cause of <symptom> and are deploying a fix. <Who/what is
affected, in plain terms.> Next update by <UTC time>.

[Monitoring] A fix has been applied and <symptom> appears resolved. We're monitoring to
confirm full recovery. Next update by <UTC time>.

[Resolved] This incident is resolved as of <UTC time>. <One-line plain-language summary.>
A post-mortem will follow. Thank you for your patience.
```

### Status-page state machine + cadence

```
Investigating ──▶ Identified ──▶ Monitoring ──▶ Resolved
```

- Move forward only on real change; you may skip Identified if a rollback resolves it before the
  cause is known (go Investigating → Monitoring).
- **Update on a fixed cadence even with no news** — every 30 min for a SEV1 is a reasonable
  default. "No change yet, next update by HH:MM UTC" is a valid, required update. Silence reads as
  abandonment.
- Hit every committed next-update time. A missed update is a broken promise during the worst
  possible moment.

## Resolve

Confirm recovery against the **same signals that detected it** — error rate back to baseline, the
affected flow exercised, the trace clean (`observability-setup`). Wait out a clean monitoring
window before declaring resolved; the mitigation moment is not the resolution moment. Then post
*Resolved*, downgrade severity, close the incident, and **schedule the blameless post-mortem** for
every SEV1/2 (`postmortem-template.md`). Record final timestamps so time-to-detect,
time-to-mitigate, and time-to-resolve are real numbers, not guesses.
