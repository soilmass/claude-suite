---
name: dependency-audit
description: >
  Confirm the supply-chain/dependency scan actually ran and interpret its advisories by
  real exploitability for this edge app — not by raw CVSS. Triages each advisory: is the
  vulnerable code path reachable, does it run at the edge or only in build/dev tooling, is
  there a fix version, and what is the minimal safe bump. Turns a wall of `npm audit` noise
  into a ranked, decision-ready list with a recommended action per advisory.
  Use when: "dependency audit", "npm audit", "vulnerable dependency", "supply chain".
  Do NOT use for: threat-modeling the feature's own logic (use security-pass), or wiring the
  scan into CI (use ci-pipeline).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the "patched the wrong advisory / ignored the reachable
    one" failure class: triaging supply-chain findings by CVSS number instead of edge
    exploitability and reachability.
    Baseline section is the encoded failure class; replace with an observed transcript.
---

# dependency-audit

The dependency scan is one of the deterministic CI gates in `../../CLAUDE.md` (definition of
done). `security-pass` only *confirms it ran*; this skill does the judgment the scanner can't:
reading each advisory against **this** app's reality — edge runtime, which code paths are
actually reachable, runtime vs. build/dev-only dependency — and turning the report into a
ranked list of "fix now / fix soon / accept with reason." It triages by exploitability, not by
the headline severity number.

---

## When to Use
- `npm audit` / `pnpm audit` (or Dependabot/Snyk/`osv-scanner`) reports advisories and you
  need to know which actually matter and what to do about each.
- A specific advisory or CVE lands on a dependency and you must decide: bump, override, or
  accept.
- Before a release, to confirm the scan ran clean — or to justify each remaining finding.
- A transitive dependency is flagged and the direct fix path is unclear.

## When NOT to Use
- Threat-modeling the feature's own logic, abuse cases, headers → `security-pass` (this skill
  is supply-chain only; `security-pass` confirms this one ran).
- Wiring the scan into CI, gating the build, scheduling it → `ci-pipeline`.
- A code-level rules/type violation in your own source → `rule-audit`.
- A flagged package being a Node-only module that won't run at the edge at all →
  `edge-runtime-constraints` decides the replacement; this skill flags the reachability.

---

## Procedure

1. **Confirm the scan actually ran and on the real tree (low cost).** A green pipeline with a
   skipped or mis-scoped audit step is the silent failure. Run the audit with the project's
   package manager against the committed lockfile, and check it covers production deps
   (`--omit=dev` view) *and* the dev tree separately — they triage differently. See
   `references/triage-playbook.md` for the exact commands per manager.

2. **Inventory every advisory before judging any (low cost).** List each: package, installed
   version, advisory ID (GHSA/CVE), CVSS, the patched version range, and whether it is a
   direct or transitive dependency. CVSS is an *input*, not the ranking — do not act yet.

3. **Score reachability and runtime surface per advisory (high cost — this is the core
   judgment).** For each: Is the vulnerable export/function on a path this app actually calls?
   Does that path run at the **edge** (request-handling, attacker-reachable) or only in
   build/dev tooling? Is it gated behind auth? A 9.8 in a dev-only formatter is lower priority
   than a 6.1 in an edge request parser. Use the reachability rubric in
   `references/triage-playbook.md`.

4. **Decide the action per advisory (high cost — wrong call ships a hole or wastes a sprint).**
   One of: **bump** to the patched range (prefer the minimal semver-safe bump), **override**
   the transitive version (npm `overrides` / pnpm `overrides` / yarn `resolutions`) when the
   parent lags, or **accept** with a written reason and an expiry. Each transitive override is
   a fork — **record it in `DECISIONS.md`** with the advisory ID and why.

5. **Apply the minimal fix and re-verify the type chain (medium cost).** Apply the bump, then
   re-run install + the audit + `tsc`. A major-version bump can break the type chain (Rule 1)
   or a boundary (Rule 8) — a fixed advisory that breaks the build is not done. Re-scan to
   confirm the count dropped and nothing new appeared.

6. **Hand any remaining accepted findings to `security-pass` (low cost).** Accepted advisories
   with reasons are an input to the launch threat model, not a quiet `audit.json` allowlist.
   `security-pass` confirms the scan ran and reviews what was accepted.

---

## Composes With
- **Pairs with:** `security-pass` (it confirms this scan ran and folds accepted advisories
  into the threat model), `ci-pipeline` (owns wiring the scan as a build-failing gate).
- **Consumes:** the CI dependency-scan output / `audit.json`, the committed lockfile.
- **Hands off:** an edge-incompatible flagged package's replacement to
  `edge-runtime-constraints`; a major-bump-driven code change to `refactor`.
- **Feeds:** `DECISIONS.md` (every override and accepted advisory) and `security-pass`.

---

## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)
> Encoded failure class, not a captured transcript; replace once observed in the wild.

**Failure class encoded:** Handed an `npm audit` report, the agent triages by CVSS alone and
fires off `npm audit fix --force`. Concrete defects that ship: (1) a critical-but-unreachable
advisory in `eslint`'s dev-only transitive tree is "fixed" while a moderate advisory in a
package that parses untrusted request bodies **at the edge** is left untouched; (2)
`--force` pulls a major-version bump that breaks the type chain (Rule 1), turned green by an
added `any`; (3) a transitive advisory is silenced with an `overrides` pin that is never
recorded in `DECISIONS.md`, so the next dev reverts it blindly; (4) the audit ran on the dev
tree only, so a production transitive vuln never surfaced; (5) remaining findings are buried
in an `audit-ci` allowlist with no reason or expiry, invisible to `security-pass`.

---

## Examples

**Input:** "`pnpm audit` shows 1 critical in `postcss` (transitive via a Tailwind plugin) and
1 high in `cookie`."
**Output:** `postcss` runs only at build time (CSS processing) — not attacker-reachable at
runtime; bump the Tailwind plugin to the release that pulls the patched `postcss`, or add a
pnpm `override` and log it. `cookie` is pure-JS, ships in the edge bundle, and parses the
attacker-controlled `Cookie` header in `middleware.ts` on every public request — *is* on a
reachable edge path. Prioritize it: bump to the patched range, re-run `tsc` (Rule 1) and
re-scan. Ranked high (cookie) before critical (postcss) because reachability beats CVSS.

**Input:** "Dependabot opened a PR bumping `zod` a major version to clear an advisory."
**Output:** Confirm the advisory's reachability first. A `zod` major can change inference and
break the **shared** Zod schemas (one schema per entity-op, Rule 8 boundaries) and downstream
RHF resolvers. Don't auto-merge: apply on a branch, run `tsc` and tests, fix the type breaks,
hand sweeping call-site changes to `refactor`. Record nothing in `DECISIONS.md` (it's a normal
bump), but note the breaking change in the PR.

**Input:** "Audit flags `node-forge`; we only use it in a seed script."
**Output:** Reachability: dev/seed-only, never bundled to the edge. Action: move it to
`devDependencies` if it isn't, bump if a patch exists, else accept with reason + expiry and
hand to `security-pass`. If it were imported into an edge route, escalate — and
`edge-runtime-constraints` would already flag it as Node-only.

---

## Edge Cases
- **No fix version exists yet** → don't `--force` a phantom fix. Assess reachability; if
  reachable, mitigate (pin, isolate the call, or drop the dep) and record the accepted risk
  with an expiry; if unreachable, accept with reason. Re-check on `perishable-refresh` cadence.
- **The advisory is in a dev/build-only dependency** → lower priority (not in the shipped edge
  bundle), but still fix dev-tree supply-chain risk (it runs on developer and CI machines).
  Triage in a separate bucket, don't ignore.
- **`npm audit fix` wants a breaking major bump** → never `--force` in the audit step. Treat it
  as a deliberate upgrade: branch, bump, fix the type chain, hand off to `refactor` if wide.
- **A flagged package is Node-only and the app is edge** → if it's genuinely unreachable at the
  edge it can't be exploited at runtime; confirm it isn't bundled, then `edge-runtime-constraints`
  owns whether it should exist at all.

## References
- `references/triage-playbook.md` — per-manager audit commands (npm/pnpm/yarn), the
  reachability + runtime-surface rubric, the bump/override/accept decision tree, and the
  `overrides`/`resolutions` syntax for pinning transitive fixes.
- `references/advisory-record-template.md` — the shape of a triaged advisory entry and the
  `DECISIONS.md` line for an override or accepted risk (ID, reason, expiry).

## Scripts
`scripts/` reserved. A wrapper that runs the manager's audit as JSON, joins each advisory to
"is this import reachable from an edge route" and emits the ranked triage table would justify
one once the reachability heuristic proves stable across real repos. Empty for now.
