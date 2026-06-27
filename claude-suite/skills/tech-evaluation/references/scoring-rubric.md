Purpose: the five-gate scorecard for evaluating a library against this stack, plus the license table and the go / conditional-go / no-go decision rule.

# The five gates

Run them in this order; the first three carry hard fails that end the evaluation early.

## 1. Edge compatibility (HARD-FAIL gate)
See `edge-compat-gate.md`. Pass = runs on the Workers-class edge runtime. Any disqualifying
tell = automatic no-go. This is the most common kill switch on this stack.

## 2. Bundle / edge weight (weighted; hard fail only if egregious)
Anything reachable from a Client Component or an edge function is paid as First Load JS AND
cold-start weight — paid twice at the edge. Score:
- **ESM + tree-shakeable** (sideEffects: false, named exports) → good. CJS-only barrel → bad.
- **Subpath exports** (`import debounce from "lodash/debounce"`) available → good. Forced
  whole-package barrel import → bad.
- **Minified+gzipped cost** of the realistic import (use bundlephobia-class data or a local
  build), not install size. A 200 kB gz lib on a hot route is a hard fail; defer or swap.
- **Transitive weight** — its own deps ride along. A "small" lib with a heavy dep is heavy.
- Mitigation for an otherwise-good heavy lib: `next/dynamic` deferral (and a real Rule 4
  loading state). Hand the deep byte breakdown to `bundle-analysis`.

## 3. Type quality (weighted; hard fail if it forces `any` with no clean wrapper — Rule 1)
The dep must not break the unbroken type chain.
- **First-party TypeScript types** shipped in the package → best. `@types/*` from DefinitelyTyped
  → acceptable but drifts. No types at all → flag.
- **Types must be real, not `any`-shaped.** `Record<string, any>`, `Function`, `as any` in the
  declarations, or a core call returning `any`/`unknown`-without-narrowing is a type-chain hole.
- **Boundary:** if the lib returns loosely-typed data (e.g. a parser, an API client), the output
  must be Zod-parsed at the boundary (Rule 8) before it re-enters the chain. Note the exact
  surface that needs the parse.
- Mitigation: a thin first-party typed wrapper that the rest of the code imports instead of the
  raw lib. If no clean wrapper is possible, no-go.

## 4. Maintenance (weighted; hard fail if unmaintained AND carrying an open CVE)
- Release cadence and **last commit / last release** date.
- **Open-vs-closed issue & PR ratio**, responsiveness to security reports.
- **Bus factor** — single maintainer vs. an org/team.
- **Tracks the stack's pins** — does it support the current Next.js / React / runtime versions?
- "Finished" ≠ "abandoned": a small, stable, CVE-free lib that does one thing is fine even with
  few recent commits. Judge by surface area + CVE status. These facts perish —
  `perishable-refresh` re-checks them on cadence; don't treat today's snapshot as permanent.

## 5. License (HARD-FAIL gate for incompatible licenses)
See the table below.

# License compatibility table

| License | Verdict |
|---|---|
| MIT, ISC, Apache-2.0, BSD-2/3-Clause, 0BSD, Unlicense | Compatible — go |
| MPL-2.0, LGPL (dynamically linked) | Conditional — escalate, usually acceptable; record in DECISIONS.md |
| GPL-2.0/3.0, AGPL-3.0 | Blocker for proprietary/SaaS — copyleft can force source disclosure; no-go unless legal signs off |
| BSL / SSPL / "source-available" / Commons Clause | Blocker — not OSS; commercial-use restrictions; escalate before any use |
| Unlicensed / no LICENSE file | Treat as all-rights-reserved → no-go until clarified |

When a license is a conditional or a blocker, do not silently decide — escalate and record the
resolution in `DECISIONS.md`.

# The decision rule

- **No-go** if ANY hard fail trips: edge-incompatible, copyleft/BSL license, forces `any` with
  no clean wrapper, or unmaintained-with-open-CVE. One hard fail is decisive regardless of how
  good the other gates score. Name the single disqualifier.
- **Conditional-go** if all hard gates pass but a weighted gate is weak AND a concrete mitigation
  exists: name it exactly (typed wrapper, `next/dynamic` deferral, a pinned version, fence to a
  non-edge route). The mitigation is part of the verdict, not an afterthought.
- **Go** if all five gates pass cleanly. Still prefer a zero-dependency Web-standard primitive
  over even a clean dependency when one does the job — the cheapest dep is none.

# Output shape

A short verdict block: candidate, job, per-gate result (pass / weak+mitigation / fail), the
single disqualifier if no-go, and the named mitigation if conditional. Hand it to `draft-adr` to
record, or to `adr-research` if it is one option among several being compared.
