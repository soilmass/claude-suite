---
name: perishable-refresh
description: >
  Re-check the reference's dated specifics — OWASP ordering, Core Web Vitals metrics and
  thresholds, tool versions, the Drizzle/Clerk/edge-driver standings — against current
  sources and propose updates to CLAUDE.md and the reference, preserving durable content.
  Presents a diff of what changed in the world vs what the canon says; never rewrites the
  source of truth silently.
  Use when: "refresh the reference", "is this still current", "update the perishables",
  "re-verify the stack facts", "check for drift", "are our versions current".
  Do NOT use for: changing the durable principles or spine decisions (those are stable by
  design), or building/auditing features (other skills).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. The meta-skill that keeps every other skill's embedded facts
    honest. Runs last in the build order (presupposes the rest exist to refresh). Baseline
    section is the encoded failure class; replace with an observed transcript.
---

# perishable-refresh

The meta-skill. It closes the loop: every other skill embeds dated facts (OWASP ordering,
CWV thresholds, tool versions, the edge-driver standings), and without a prompt to
re-check, the whole stack silently runs on stale ones. The reference explicitly *marks*
what perishes; this skill acts on those markers. Report-and-propose: it never edits the
canon silently — it shows a diff and waits for the user's word.

It touches only the marked-perishable specifics. The durable principles — the spine, the
nine inviolable rules, the type-chain discipline — are stable by design and out of scope.

---

## Non-Negotiable Rules
- **Never silently rewrite the source of truth.** Present a diff of world-vs-canon and the
  proposed change; apply only on the user's sign-off. The canon changes on the user's word,
  not the skill's.
- **Touch only marked-perishable items.** Do not "improve" durable principles or re-open
  spine decisions under cover of a refresh. If you think a durable item is wrong, raise it
  separately — don't fold it into the refresh.

Refuse: "just update everything you think is outdated"; "go ahead and apply the changes";
"while you're in there, also change [durable principle]."

---

## When to Use
- Periodic currency check of the reference and `CLAUDE.md`.
- Before relying on a dated fact (a CWV threshold, an OWASP ranking, a version) that may
  have moved.

## When NOT to Use
- Durable principles / spine → out of scope by design.
- Feature work, audits, migrations → the respective skills.

---

## Procedure

1. **Work from the reference's own perishability markers (minimal interrogation).** The
   reference marks what dates; enumerate those items. Don't guess what's perishable —
   read the markers.

2. **Re-verify each marked item against current sources.** For each: OWASP Top 10
   ordering and the current "insecure design"/misconfiguration standings; Core Web Vitals
   — which metrics are current (INP replaced FID; watch for further changes) and the p75
   thresholds; tool versions (Next.js, Drizzle, Clerk, Tailwind, the serverless driver);
   the edge-driver landscape. Use current sources, not memory — that's the whole point.

3. **Present a world-vs-canon diff (report-and-propose).** For every changed item, show
   what the reference currently says vs what the world now says, with the source. Walk
   **every** marked-perishable item — not a sample — and report which you verified as
   still-current vs changed (completeness check).

4. **Flag downstream consequences.** A changed fact often ripples: a superseded CWV metric
   means the CI budget threshold *and* any skill referencing it both need updating; a
   reordered OWASP list means `security-pass`'s framing updates. Name the ripple so a fix
   isn't half-applied.

5. **Apply nothing without sign-off.** Propose the edits to `CLAUDE.md`/the reference; the
   user approves. Record significant currency updates in `DECISIONS.md` (e.g. "adopted
   INP threshold X per 2026 guidance") so the history shows when the canon moved and why.

---

## Composes With
- **Closes the loop on the whole system** — keeps the facts embedded in every other skill
  honest (the OWASP set `security-pass` uses, the thresholds the perf budget enforces, the
  versions `t3-genesis` scaffolds).
- **Runs last** in the build order: it presupposes the rest exist to refresh.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project conventions). The encoded failure class was confirmed.

**Observed run.** Asked to refresh the perishable facts, the agent rewrote the entire
reference from training memory without consulting a single primary source (npm, owasp.org,
web.dev), attached no dates or source URLs to any claim, and produced a full prose
overwrite instead of a reviewable proposed-changes diff. Every "current stable" version is
an unverified recollection, and stale-fast guidance was asserted as fact:

```
| Zod | zod | 3.24.x (4.x available, migrate when stable across deps) |
...
## OWASP Top 10 (2021 — still the current published list)
```

Neither claim was checked — the Zod peer-dep state is a memory snapshot, and "2021 is
still current" was asserted without confirming whether OWASP Top 10 2025 had shipped.

**Failure class (confirmed).** The whole point of a refresh is re-verifying against current,
dated sources; an agent left to its own devices instead launders training-cutoff memory as
"current," producing version numbers and standings that are confidently wrong and carry no
provenance for the next refresh to re-check. This skill forces source-grounded verification
with dates and a report-and-propose diff rather than a silent memory-based rewrite.

---

## Examples
**Input:** "Is the reference still current? Refresh the perishables."
**Output:** Reads the perishability markers → re-verifies each against current sources →
presents: "CWV: reference still lists FID — superseded by INP; propose updating the metric
and the p75 budget threshold (downstream: CI budget config + a11y-gate's CLS note).
OWASP: ordering unchanged. Versions: Drizzle moved 0.3x→0.4x, minor; Clerk edge API
stable." → waits for sign-off → on approval, edits CLAUDE.md + CI config and records the
INP adoption in DECISIONS.md.

---

## Edge Cases
- **A source is ambiguous or sources conflict** → present the conflict, don't pick a
  winner silently; let the user decide which to adopt.
- **A "perishable" turns out to implicate a durable decision** (e.g. a tool is deprecated
  hard) → flag it as a spine-level question for the user, not a quiet refresh edit.
- **Nothing changed** → report "all marked items verified current as of [date]"; that's a
  valid, valuable result, not a no-op to skip.

---

## References
- `references/perishables.md` — the catalog of what's marked perishable in this stack and
  the canonical source to check each against.

## Scripts
`scripts/` reserved for a version-check helper (reads lockfile vs latest) if real runs
show it'd save time. Empty for now.
