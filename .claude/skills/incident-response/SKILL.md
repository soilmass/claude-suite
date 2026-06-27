---
name: incident-response
description: >
  Run a production incident as a coordinated process, not a scramble: classify it by impact
  (SEV1–3), let anyone declare but name one Incident Commander, stand up the war room (commander
  / ops lead / comms lead / scribe), and drive the loop — detect → triage → mitigate →
  communicate → resolve. Forces the disciplines a panicked team drops: mitigate before chasing
  root cause, communicate early on a fixed cadence (holding statements + status page), and close
  every SEV1/2 with a blameless post-mortem whose action items are owned, dated, and tracked. A
  runaway-cost event is an incident too. Timeline is UTC (Rule 6); public comms leak no secrets
  or PII (Rule 9).
  Use when: "incident response", "we have an outage", "production is down", "declare an incident",
  "on-call escalation", "write a post-mortem", "severity levels".
  Do NOT use for: the mechanics of one mitigation — reversing a bad deploy or migration (use
  rollback-runbook); restoring lost or corrupted data from backups (use disaster-recovery).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the "heroics instead of process" failure class: no severity
    definition, no named commander, root-cause hunting while users stay down, customers left in
    the dark, and a resolved incident with no blameless post-mortem or tracked action items.
    Baseline observed (clean-room capture).
---

# incident-response

The coordination layer above a single fix. `rollback-runbook` reverses one bad deploy and
`disaster-recovery` restores lost data — those are *mitigation actions*. This skill is the
*process that wraps them*: how bad it is, who runs it, how the team stops the bleeding before
diagnosing, how customers hear about it, and how the team learns without blame. It exists because
the default response to an outage is heroics — a few people diving at root cause in silence —
which is slower, untracked, and teaches nobody.

The spine and nine rules live in `../../CLAUDE.md`. This skill consumes the signals
`observability-setup` wires (Rule 6 UTC stamps make the timeline trustworthy) and the tripwire
`spend-cap` sets, and honors Rule 9 / `log-discipline` at the public-comms boundary.

---

## Non-Negotiable Rules

An incident is run under adrenaline, which is exactly when these get skipped. Hard lines:

- **Never chase the root cause before mitigating.** Stop the bleeding first — roll back, flag
  off, fail over — *then* diagnose. Users recovered on a not-yet-understood mitigation beats users
  down while you find the elegant fix. Diagnosis is step 7, not step 1.
- **Never go dark on customers.** Post a holding statement early and update on a *fixed cadence*
  even when there is nothing new to say — silence during an outage is a second incident. Never put
  a secret, credential, internal hostname, or customer PII in a public update (Rule 9 /
  `log-discipline`).
- **Never run an incident without one named Incident Commander.** Anyone may *declare*; exactly
  one person *commands*. "Everyone knows who's running this" means nobody is. The IC coordinates
  and decides — they do not also go heads-down debugging.
- **Never close a SEV1/2 without a blameless post-mortem and tracked action items.** "Human
  error" is never a root cause — it is the first question (*why did the system let a human do
  that?*). A post-mortem with no owned, dated, tracked action items is theater.

Refuse these rationalizations: "let's find root cause first, then tell people" · "it was just
human error, nothing to fix" · "we'll post an update once we actually know something" · "it's
resolved, we don't need a post-mortem" · "everyone knows who's running point."

---

## When to Use
- A production outage, severe degradation, data corruption, or security exposure is live and
  needs a coordinated response right now.
- Defining the severity matrix, on-call escalation ladder, and incident roles *before* the first
  incident (the setup pass).
- A `spend-cap` tripwire / runaway-cost event needs to be run as an incident, not silently
  absorbed.
- Running the blameless post-mortem after a SEV1/2 has resolved.

## When NOT to Use
- The mechanics of one mitigation — promoting the prior build, reversing a migration → `rollback-runbook`
  (this skill *calls* it as one step in mitigate).
- Restoring lost or corrupted data via point-in-time restore → `disaster-recovery` (the path past
  `rollback-runbook`'s lossless boundary).
- Wiring the alerts, traces, and Sentry capture that *detect* an incident → `observability-setup`.
- Setting the spend caps and billing alerts before launch → `spend-cap` (this skill runs the
  incident when one fires).
- A routine bug with no production impact → normal triage / `vertical-slice`, not an incident.

---

## Procedure

1. **Define severities, roles, and escalation before the first incident (setup, do once —
   high leverage).** Write the SEV1–3 matrix *by impact* (scope of users, data/security, revenue),
   the on-call rotation and escalation ladder, and the role roster. Make the bar to *declare* low:
   anyone can. See `references/severity-and-roles.md`.

2. **Detect → triage: declare, set severity, name one Commander (high — mis-severity cuts both
   ways).** A signal fires (an `observability-setup` alert or a human report). Assess impact,
   assign SEV1/2/3, and *declare* — the first responder is Incident Commander until they hand off.
   Over-declaring a SEV3 you later downgrade is cheap; under-calling a SEV1 is the expensive miss.
   See `references/severity-and-roles.md`.

3. **Mitigate before root cause — stop the bleeding (highest priority).** Apply the fastest safe
   action that restores users: promote the prior build (`rollback-runbook`), flip a feature flag
   off, fail over, or shed load. Defer diagnosis. If mitigation needs a destructive reversal,
   `rollback-runbook`'s contract check decides whether it is safe or must hand to `disaster-recovery`.
   See `references/response-loop.md`.

4. **Communicate early and on a cadence (high — silence is its own incident).** For any
   customer-visible SEV1/2, the comms lead posts a holding statement within the first window
   (acknowledge, impact, what we're doing, next-update time) and commits a fixed cadence. Drive the
   status page Investigating → Identified → Monitoring → Resolved. No speculation, no blame, no
   secrets/PII (Rule 9). See `references/response-loop.md`.

5. **Stand up the war room and keep the timeline (medium).** The IC coordinates and decides; the
   ops lead investigates and applies mitigations; the comms lead owns external updates; the scribe
   records a **UTC-timestamped** timeline (Rule 6) of every action and decision. One channel, one
   source of truth. See `references/severity-and-roles.md`.

6. **Resolve and downgrade (medium).** Confirm recovery against the same `observability-setup`
   signals that detected it — error rate, the affected flow, the trace. Only after a clean
   monitoring window: downgrade severity, post the Resolved update, and close. Do not declare
   victory at the moment of mitigation. See `references/response-loop.md`.

7. **Run the blameless post-mortem with tracked action items (high — the learning lives here).**
   Within a fixed window for every SEV1/2: write it blameless (systemic contributing factors, not
   individual fault), with a UTC timeline, impact, 5-whys / contributing factors, what went
   well/poorly, and action items that are **owned, dated, and tracked to completion**. Hand each
   item to the skill that fixes it. Template in `references/postmortem-template.md`.

---

## Composes With
- **Consumes:** `observability-setup` — the OTel/Sentry alerts and traces that detect and triage
  the incident and (at step 6) confirm recovery, UTC-stamped per Rule 6; `spend-cap` — a tripwire
  firing is the *detect* signal for a cost incident.
- **Pairs with:** `rollback-runbook` — promoting the prior build or reversing a migration is one
  mitigation action this skill invokes inside step 3, not the whole incident; it owns the
  code-vs-schema and contract-boundary mechanics this skill does not restate.
- **Hands off:** `disaster-recovery` when mitigation needs a point-in-time restore of lost/corrupted
  data (past `rollback-runbook`'s lossless boundary); each post-mortem action item to the owning
  skill — `security-pass` (a missing ownership check, Rule 2), `vertical-slice` / `migration-author`
  (the fix), `log-discipline` (which owns the PII rule the public comms must honor).

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project
> conventions): "write our production incident response process." The imagined catastrophe (no
> severities, no commander, root-cause-first, no post-mortem) did NOT occur — a capable base
> model produces a competent *generic* runbook. A **narrower** failure class was confirmed.

**Observed run.** The agent produced a genuinely strong document: severity by customer impact
with "round up if unsure," an IC who "owns the incident, not the fix" (and must not be heads-down
on a SEV1), the full role roster (IC / responders / comms / scribe), explicit
mitigate-before-diagnose, a fixed comms cadence with the Investigating → Identified → Monitoring →
Resolved lifecycle, and a blameless post-mortem with owned, dated action items. The *disciplines*
were present. What was missing was every point where the process meets **this** stack:

```text
- fastest safe mitigation: roll back the recent deploy, disable the feature flag, fail
  over, scale up ...  "A rollback you understand beats a forward-fix you're guessing at."
- Deploy history / rollback procedure: [link]        # deferred to a stub
- Timeline — detection → mitigation → resolution, with timestamps   # "timestamps", not UTC
```

It treated "roll back the deploy" as a **single safe lever** — no awareness that on the edge stack
code rolls back instantly (pointer-based) while schema may be irreversible, the exact
oversimplification `rollback-runbook` exists to prevent — and deferred the actual mechanics to a
`[link]` stub. Its "what counts as an incident" list was availability / data / security only: a
runaway-**cost** event is nowhere, so a budget blowout would never be declared. The post-mortem
timeline used unqualified "timestamps" (not UTC, Rule 6); public-comms discipline was gestured at
("don't post details") but never stated as no-secrets / no-PII (Rule 9); and the security section
gave generic "rotate creds / preserve evidence" advice without naming this stack's actual
data-exposure root cause — a `protectedProcedure` missing its ownership check (Rule 2, the #1
vulnerability class).

**Failure class (confirmed, narrowed).** Not "produces a scramble" — "produces a competent
*generic* runbook with the stack-specific load left unbound." The base model gets the human
process right, then (1) treats rollback as one safe undo instead of routing to `rollback-runbook`'s
code-vs-schema / contract check (and `disaster-recovery` when lossy), (2) omits cost incidents
entirely, and (3) leaves the cross-cutting rules ungrounded — timeline not UTC (Rule 6), comms not
bound to no-secrets/PII (Rule 9), security root-cause not tied to the ownership check (Rule 2).
This skill supplies exactly those bindings.

---

## Examples

**Input:** "The app is down — 500s for everyone."
**Output:** Declare **SEV1**; first responder takes IC and pages the ops lead, comms lead, and
scribe. **Mitigate first:** the `observability-setup` error spike started at the last deploy → call
`rollback-runbook` to promote the prior build — *do not* diagnose the bug yet. Within 15 min the
comms lead posts an *Investigating* status: "investigating elevated errors, next update in 30 min,"
no cause speculation, no internal detail. Errors clear → *Monitoring*, then *Resolved* after a
clean window. A blameless post-mortem is scheduled; the render bug becomes a tracked, owned,
dated action item.

**Input:** "Sentry alert — a customer can see another tenant's invoices."
**Output:** **SEV1** security incident (data exposure). **Mitigate:** flag the leaking route off /
cut access before diagnosing. Root cause is a `protectedProcedure` missing its ownership check —
Rule 2, the #1 vulnerability class. Comms: a careful holding statement that does **not** disclose
the specifics or affected data publicly (Rule 9); privacy/legal looped per severity. Post-mortem
action item: add the ownership check **and** a `trpc-integration-test` asserting cross-tenant
denial — owned and dated, handed to `security-pass`. Not "Bob was careless."

**Input:** "spend-cap fired — Vercel usage hit 90% of the monthly cap on day 3."
**Output:** Declare a **SEV2** cost incident (a runaway bill is an incident). **Mitigate:** throttle
/ cap the runaway surface and find the driver — a retry storm or an unsampled trace. Comms is
internal (on-call + budget owner), no public status page. Post-mortem: the missing sample-rate
cap becomes an action item handed to `observability-setup` / `log-discipline`, recorded in
`DECISIONS.md`.

## Edge Cases

- **The IC is also the only person who can fix it** → split the role immediately; hand IC to
  someone else so the fixer goes heads-down. The commander coordinates, never also debugs.
- **It's ambiguous whether this is a real incident** → declare anyway. Over-declaring a SEV3 you
  downgrade costs minutes; under-declaring a SEV1 costs the outage. You can always downgrade.
- **The mitigation itself is risky / irreversible** (a destructive rollback) → that is
  `rollback-runbook`'s contract-boundary check; if reversal is lossy, hand to `disaster-recovery` —
  never fire a destructive `down` under pressure.
- **The cause is an upstream vendor** (DB provider outage) → you still own customer comms and the
  status page. Mitigate with failover / degraded mode, post that you're monitoring an upstream
  provider, and the post-mortem still has action items (resilience, multi-region) even though the
  bug wasn't yours.

## References
- `references/severity-and-roles.md` — the SEV1–3 impact matrix (scope / data / revenue), who can
  *declare* (anyone) vs who *commands* (the one IC), the war-room role roster (IC / ops lead /
  comms lead / scribe), and the on-call escalation ladder.
- `references/response-loop.md` — the detect → triage → mitigate → communicate → resolve loop, the
  mitigate-before-root-cause rule, holding-statement templates, and the status-page state machine
  (Investigating → Identified → Monitoring → Resolved) with cadence.
- `references/postmortem-template.md` — the fill-in blameless post-mortem template (summary, UTC
  timeline, impact, contributing factors / 5-whys, what went well/poorly, owned + dated action
  items) and the blameless framing that keeps it honest.

## Scripts
`scripts/` is reserved (`.gitkeep`). A signal that would justify one: a check over the incident
log flagging any closed SEV1/2 with no linked blameless post-mortem carrying at least one owned,
dated action item — a mechanical version of the step-7 discipline. Deferred until the
incident-log format stabilizes.
