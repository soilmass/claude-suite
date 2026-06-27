---
name: tech-evaluation
description: >
  Evaluate a candidate library or tool against THIS edge stack before it enters the
  dependency tree: does it run on the Workers/edge runtime (no Node built-ins, no long-lived
  TCP, Web-standard APIs), what does it cost in client/edge bundle weight, is it
  type-safe enough to keep the type chain unbroken (Rule 1), is it maintained and licensed
  compatibly. Produces a go / no-go verdict with the disqualifier named, not a feature
  comparison blog post. Use when: "evaluate this library", "should we use X", "is X edge
  compatible", "compare libraries". Do NOT use for: recording the resulting decision (use
  draft-adr), or gathering the broader evidence dossier an ADR needs (use adr-research).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the "picked a dep that can't run at the edge / breaks the
    type chain / is abandoned" failure class: a library chosen on GitHub stars and a README,
    which then fails the edge build, drags `any` across a boundary, or is unmaintained.
    Baseline section is the encoded failure class; replace with an observed transcript.
---

# tech-evaluation

A dependency is a long-term liability, and on the edge runtime most popular libraries are
simply disqualified — they reach for `fs`, a native addon, or a persistent socket the
runtime does not provide. This skill scores a candidate against the five gates that decide
fit for THIS stack (see `../../CLAUDE.md`): edge-compatibility, bundle cost, type quality,
maintenance, and license. It is an analysis pass that ends in a go / no-go verdict naming the
single disqualifier when there is one; it does not write the decision record or build with
the dep.

---

## When to Use
- Someone proposes adding a library and you need a fit verdict before it lands in `package.json`.
- "Is X edge-compatible?" — the first and most common kill switch on this stack.
- Comparing two or three candidates for the same job (date handling, charting, a parser).
- A dep was added casually and you want to retro-justify or flag it before launch.

## When NOT to Use
- Recording the chosen decision and its rationale as a durable record → `draft-adr`.
- Assembling the multi-source evidence dossier (prior art, benchmarks, community signals)
  that a significant ADR cites → `adr-research` (this skill is one input it consumes).
- Measuring real throughput/latency of a candidate under load → `benchmark-harness`.
- Finding what already exists for the job before evaluating one → `prior-art-search`.
- Auditing deps already installed for CVEs / license drift → `dependency-audit`.

---

## Procedure

1. **State the job and the alternatives first (low cost).** Name what the library is *for* in
   one sentence and what it would replace (a hand-rolled util, the platform API, another dep).
   If a Web-standard or already-installed primitive does the job (`Intl`, `URL`, `crypto.subtle`,
   `structuredClone`, a Drizzle/Zod feature), the evaluation may end here — the best dep is none.
   If you have not surveyed alternatives, hand off to `prior-art-search` first.

2. **Run the edge-compatibility gate (HIGH cost — this is the usual kill switch).** On the
   Workers-class edge runtime, a library is disqualified if it imports `node:*` built-ins
   without a shim, ships a native/`.node` addon, opens a long-lived TCP socket, uses
   `eval`/dynamic code gen, or assumes a full Node global scope. Check `package.json` `exports`
   for a `"workers"`/`"edge-light"`/`"browser"` condition, grep the source for the tells, and
   confirm against the runtime's supported API list. See `references/edge-compat-gate.md`. A
   hard fail here ends the evaluation — record the no-go in `DECISIONS.md` and stop.

3. **Score bundle and edge weight (medium cost).** Anything reachable from a Client Component or
   bundled into an edge function is paid as First Load JS *and* cold-start weight (paid twice on
   the edge). Check whether the package is ESM and tree-shakeable, whether it has subpath exports
   or forces a barrel import, its install size vs. minified+gzipped cost, and its own transitive
   deps. See `references/scoring-rubric.md` for the weight rubric; hand a deep byte analysis to
   `bundle-analysis`.

4. **Score type quality against the type chain (medium cost — Rule 1).** The dep must not force
   `any`, `@ts-ignore`, or an untyped boundary. Prefer first-party TypeScript types over
   `@types/*` (which drift); confirm types are not just `any`-shaped (`Record<string, any>`,
   `Function`). A library that returns `any` from its core call is a type-chain break waiting to
   happen — note the exact surface that would need a Zod parse (Rule 8) to re-enter the chain.

5. **Score maintenance and license (medium cost).** Maintenance: release cadence, open-vs-closed
   issue ratio, last commit, bus factor, whether it tracks the runtime/framework versions this
   stack pins. License: must be permissive and compatible (MIT/Apache-2.0/ISC/BSD class); flag
   copyleft (GPL/AGPL) and source-available/BSL licenses as blockers or escalations. See
   `references/scoring-rubric.md`. Maintenance facts perish — note that `perishable-refresh`
   owns re-checking them later.

6. **Produce the verdict (low cost).** Emit a go / conditional-go / no-go per the rubric: any
   single hard fail (edge-incompatible, copyleft, forces `any` with no wrapper, unmaintained
   with a CVE) is an automatic no-go regardless of the other scores. For a conditional go, name
   the exact mitigation (a typed wrapper, `next/dynamic` deferral, a pinned version). Hand the
   verdict to `draft-adr` to record, or to `adr-research` if it is one option among several.

---

## Composes With
- **Feeds:** `adr-research` (this verdict is one evidence input to the ADR dossier), and
  `draft-adr` (the decision record that cites the verdict).
- **Pairs with:** `benchmark-harness` (it measures the candidate's runtime cost where speed is
  the deciding axis; this judges fit), `prior-art-search` (it finds the candidates; this scores
  one).
- **Hands off:** a deep client-byte breakdown to `bundle-analysis`; an edge-API question on an
  already-chosen dep to `edge-runtime-constraints`; installed-dep CVE/license audit to
  `dependency-audit`; later re-verification of maintenance/version facts to `perishable-refresh`.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project
> conventions). The encoded failure class was confirmed.

**Observed run.** Asked to evaluate `moment` for date handling, the naive agent produced a
well-argued blog-post verdict — recommend against, prefer `date-fns` + native `Intl` — but
reached it by vibe, not by a gated checklist. It never read `CLAUDE.md`, `DECISIONS.md`, or this
skill, so it skipped the required structure and recorded nothing in `DECISIONS.md`; its bundle
numbers and the "2020 maintenance mode" claim were quoted from memory with no dated primary
source; and it asserted edge fitness loosely without separating "runs at the edge" from "too
heavy for the edge bundle":

```
**Bundle cost — this is the big one for an edge app.**
- Moment is large: ~290KB minified (~70KB gzipped) for the full build...
| **date-fns** | ~few KB (per-fn import) | Yes | Yes | Excellent | Yes |
```

**Failure class (confirmed).** The agent landed a plausible recommendation while skipping the
gates that make it trustworthy: no edge-vs-bundle disqualifier separation, no dated primary
evidence (perishable facts from memory), no weighted criteria pinned before evidence, and no
`DECISIONS.md` record. A right-sounding verdict built on unverified numbers and ad-hoc weighting
is exactly the failure this skill's five-gate checklist prevents.

---

## Examples

**Input:** "Should we use `moment` for date handling?"
**Output:** No-go (with a lighter path). Edge gate: passes (pure JS). Bundle: hard fail —
`moment` is not tree-shakeable and ships its whole locale set; on the edge that weight is paid
twice. Type quality: adequate. Verdict: prefer the zero-dep `Intl.DateTimeFormat` for display
(which aligns with Rule 6's display-edge conversion) or `date-fns`/`Temporal` if arithmetic is
needed. Records the no-go reasoning for `draft-adr`.

**Input:** "Evaluate `bcrypt` for password hashing in our auth flow."
**Output:** No-go, edge gate hard fail — `bcrypt` is a native addon (`.node` binary) that cannot
load on the Workers runtime. Note that auth is Clerk's job on this stack anyway (see
`../../CLAUDE.md`), so this is also solving a problem the stack already owns; if a Web-Crypto hash
is genuinely needed, `crypto.subtle` (PBKDF2/SHA-256) is the edge-native path. Stop and record.

**Input:** "Compare `recharts` vs `visx` for the dashboard charts."
**Output:** Both pass the edge gate (client-only render). Differentiators: bundle weight (recharts
is heavier and less tree-shakeable; visx is composable, import only the primitives used), type
quality (visx ships sharper first-party types). Conditional-go on either with `next/dynamic`
deferral so the chart weight stays off the critical path and the loading state (Rule 4) is real.
Hands the byte comparison to `bundle-analysis` and the runtime feel to `benchmark-harness`.

---

## Edge Cases
- **The dep only ever runs in a Node-only route / build step, never at the edge** → the edge gate
  does not apply; score it on bundle/types/maintenance only, and record in `DECISIONS.md` that its
  use is fenced to a non-edge context so nobody imports it into an edge path later.
- **It is great but solves a problem a Web-standard API already solves** → no-go on principle; the
  cheapest, most edge-safe dependency is the one you don't add. Name the platform primitive.
- **First-party types are absent or `any`-shaped but the lib is otherwise ideal** → conditional-go
  *only* with a thin typed wrapper that Zod-parses its output at the boundary (Rule 8); the wrapper,
  not the raw lib, is what the rest of the code imports. If no clean wrapper is possible, no-go.
- **Maintenance looks stale but the lib is small and stable (does one thing, no CVEs)** → not an
  automatic fail; "finished" is different from "abandoned." Judge by surface area and CVE status,
  and note `perishable-refresh` should re-check it on cadence.

---

## References
- `references/edge-compat-gate.md` — the edge-compatibility checklist: the disqualifying tells
  (`node:*`, native addons, persistent sockets, `eval`), how to read `package.json` export
  conditions, and the Web-standard substitutes for the common offenders.
- `references/scoring-rubric.md` — the five-gate scorecard (edge / bundle / types / maintenance /
  license) with hard-fail vs. weighted criteria, the license compatibility table, and the
  go / conditional-go / no-go decision rule.

## Scripts
`scripts/` reserved. A script that, given a package name, fetches its `package.json` and greps the
published tarball for `node:`/native-addon/socket tells and reports an edge-compat pre-verdict would
justify one once the heuristic proves low-false-positive across real packages. Empty for now.
