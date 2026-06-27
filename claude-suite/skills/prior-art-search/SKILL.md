---
name: prior-art-search
description: >
  Before writing a line, find what already solves the problem — inside this repo first
  (an existing tRPC router, a Drizzle helper, a shadcn primitive, a Zod schema), then in
  the stack's own primitives (Web-standard APIs, Drizzle/Zod/Clerk features), then in the
  community. Produces a short prior-art memo: what exists, how close each match is, and a
  build / adopt / extend recommendation — so the team doesn't reinvent a helper that lives
  three folders over, or hand-roll behavior shadcn/Radix already ships (see ../../CLAUDE.md).
  Use when: "prior art", "has this been done", "find existing solution", "is there a library for".
  Do NOT use for: evaluating one already-chosen tool against criteria (use tech-evaluation),
  or sizing the market/rivals (use competitive-analysis).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the reinvention failure class: building a helper, hook,
    schema, or interaction that already exists in-repo, in a stack primitive, or as a
    Web-standard API — duplicated, drifting, and untyped.
    Baseline section is the encoded failure class; replace with an observed transcript.
---

# prior-art-search

The cheapest code is the code you don't write. This skill runs a tiered search — in-repo,
then stack primitives, then community — before any build begins, and ends in a prior-art
memo with a build / adopt / extend verdict. It exists to kill three recurring wastes:
re-implementing a helper that already lives in the codebase, hand-building interaction that
shadcn/Radix already ships (a CLAUDE.md spine decision), and pulling a dependency for what a
Web-standard API does for free. It surveys and recommends; it does not score a chosen tool
or build the feature.

## When to Use
- Before starting any non-trivial feature, helper, hook, or component — "has this been done?"
- "Is there a library for X?" — but the first question is always "do we already have X?"
- A pattern feels familiar (cursor pagination, optimistic update, money formatting) and is
  likely already solved somewhere in the repo or by a sibling skill.
- An interaction (dialog, combobox, focus trap) is about to be hand-rolled — Rule of the
  spine: compose shadcn/Radix instead, so confirm what the primitive already gives you.

## When NOT to Use
- You have one named candidate and need a go/no-go fit verdict for this edge stack →
  `tech-evaluation` (this skill finds candidates; that one scores one).
- You are sizing the market, rival products, or positioning → `competitive-analysis`.
- The unknown is a feasibility question needing a throwaway prototype → `spike-research`.
- Assembling the full evidence dossier for an architecture decision → `adr-research`.
- You already know nothing exists and just need it built → `vertical-slice`.

## Procedure

1. **State the capability in one sentence, stack-shaped (low cost).** Name what you need as
   a behavior, not a library: "format minor-unit money for display" (Rule 5/6), "cursor
   paginate a Drizzle list", "trap focus in a modal". A precise capability statement is what
   makes the search find matches instead of synonyms. See `references/search-tiers.md`.

2. **Search in-repo FIRST (HIGH cost to skip — this is where reinvention happens).** Grep the
   codebase before anything external: `src/db/schema` for an existing table/column,
   `src/server` routers for an existing procedure, `src/lib`/`src/utils` for a helper,
   `src/components` for a component, the shared Zod schemas for an existing validator. Most
   "new" needs are 80% built already. See `references/search-tiers.md` for the grep recipes.

3. **Check the stack's own primitives next (medium cost).** Before any dependency, ask whether
   a Web-standard API or an installed-primitive feature already does it: `Intl` for money/date
   display (Rule 6), `crypto.subtle`/`crypto.randomUUID`, `URL`/`URLSearchParams`,
   `structuredClone`; a Drizzle relational-query/`sql` feature (Rule 7); a Zod refinement; a
   Clerk hook/helper for anything auth (the spine owns auth); a shadcn/Radix primitive for any
   interaction. See `references/stack-primitives.md` — the "we already have this" catalog.

4. **Map to a sibling skill if one owns the pattern (low cost).** Many recurring needs are
   already a procedure here: cursor pagination → `pagination-cursor`, optimistic UI →
   `optimistic-updates`, money modeling → `money-modeling`, UUIDv7 → `uuidv7-ids`, soft delete
   → `soft-delete-pattern`, multitenancy scoping → `multitenancy-scoping`. Finding the skill is
   finding the prior art. See `references/search-tiers.md` for the index.

5. **Survey the community only if tiers 2–4 came up empty (medium cost).** Search npm, the
   framework docs, and known edge-compatible libraries — but capture *candidates*, not a
   verdict. Note each one's apparent edge-fit (Rule: this stack runs at the edge) and rough
   maturity so the handoff to `tech-evaluation` starts warm. Don't evaluate here; that's its job.

6. **Rank matches by closeness and write the memo (low cost).** For each hit, rate
   exact / partial / adjacent and recommend **adopt** (use as-is), **extend** (wrap or
   generalize the existing thing), or **build** (nothing fits — say why, name what was
   searched). Use `references/prior-art-memo.md`. If the search resolves a fork (e.g. "we will
   standardize on the existing helper, not a new dep"), record it in `DECISIONS.md`.

## Composes With
- **Feeds:** `tech-evaluation` (hands it the community candidates this surfaced, with edge-fit
  notes), `vertical-slice`/`schema-design` (when the verdict is build, with the in-repo pieces
  to reuse), `refactor` (when the verdict is extend — generalize the existing thing in place).
- **Pairs with:** `competitive-analysis` (it scans the market; this scans solutions/code),
  `adr-research` (this is one evidence input to its dossier).
- **Hands off:** unscored community candidates to `tech-evaluation` for five-gate scoring; a feasibility
  question with no clear prior art to `spike-research`.

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project
> conventions). The encoded failure class was confirmed.

**Observed run.** Asked to do a prior-art search for "CSV export," the naive agent grepped
broadly, correctly concluded no prior art exists, and then produced a free-form findings doc
that ignored the house format entirely — no `Use when:`/`Do NOT use for:` framing, no ranked
adopt/extend/build memo, no record against `DECISIONS.md` — and drifted past pure prior-art
into forward-looking build advice it inferred rather than cited:

```markdown
## Recommendation
Greenfield: there is nothing to extend. Build new. Decisions to make up front:
- Generate via a Next.js Route Handler returning `text/csv` (streamed), not a JSON tRPC proc.
- Pick an edge-safe CSV serializer (verify Web Streams / no Node `Buffer` dependency).
- Apply ownership scoping to the exported rows (Rule 2) and pull data with a single
  relational query, not per-row.
```

It never read `CLAUDE.md`, `DECISIONS.md`, or any `SKILL.md`, never invoked the suite's own
procedure, and skipped git history and the README narrative — so the search was neither
house-format nor exhaustive.

**Failure class (confirmed).** Without the skill, an agent treats prior-art search as ad-hoc
grepping that yields a one-off prose doc instead of the suite's structured, ranked memo wired
to `DECISIONS.md`. It also smears the search into premature build recommendations and stops at
the live tree, missing git history and planning docs — so the result is unrepeatable, drifts
from the spine, and the next person re-runs the same incomplete search.

## Examples

**Input:** "Is there a library for formatting money on the invoice line items?"
**Output:** In-repo grep finds `src/lib/money.ts` exporting `formatMinorUnits(cents, currency)`
— exact match. Verdict: **adopt**, no library. Memo notes the helper already enforces Rule 5
(minor units) and uses `Intl.NumberFormat` at the display edge (Rule 6). No `DECISIONS.md`
entry needed; nothing was forked.

**Input:** "Has anyone built cursor pagination here, or should I add a pagination lib?"
**Output:** No in-repo helper, but `pagination-cursor` (sibling skill) owns the Drizzle
keyset-pagination pattern, and no dependency is warranted — `drizzle` + `Zod`-validated cursor
input (Rule 8) covers it. Verdict: **build via the skill's pattern.** Hands off to
`pagination-cursor`; flags `tech-evaluation` is unnecessary since no dep is in play.

**Input:** "I need a multi-select combobox with search — what library?"
**Output:** Stack-primitive tier hits first: the spine mandates composing shadcn/ui (Radix)
for interaction, and shadcn ships a `Command`/combobox primitive with focus trap and keyboard
nav for free. Verdict: **adopt the primitive, extend with the project's tokens** (Rule 3); do
not hand-roll and do not add a third-party combobox. Hands the styling to `shadcn-compose`.

## Edge Cases
- **In-repo match exists but is subtly wrong (untyped, floats money, misses an ownership
  check)** → verdict is **extend via `refactor`**, not adopt-as-is; reusing a Rule-violating
  helper propagates the violation. Note the defect in the memo so the extend fixes it.
- **Two in-repo solutions already exist and disagree** → that is drift; the verdict is
  consolidate (hand to `refactor`) and record the canonical one in `DECISIONS.md`, not "pick
  one silently."
- **Nothing in-repo or in primitives, several community options** → stop at *candidates*; do
  not pick. Hand the shortlist with edge-fit notes to `tech-evaluation` — choosing is its job.
- **The "prior art" is a SaaS/API, not code** → that crosses into build-vs-buy; capture it but
  flag that `competitive-analysis` and `tech-evaluation` jointly own the buy side.

## References
- `references/search-tiers.md` — the four-tier search order (in-repo → stack primitives →
  sibling skills → community), with the concrete grep/ripgrep recipes for each repo location
  and the index of which sibling skill owns which recurring pattern.
- `references/stack-primitives.md` — the "we already have this" catalog: Web-standard APIs,
  Drizzle/Zod/Clerk/shadcn features, and the common reinventions each one replaces.
- `references/prior-art-memo.md` — the memo template: capability statement, ranked matches
  (exact/partial/adjacent), the adopt/extend/build verdict rule, and what-was-searched record.

## Scripts
Reserved; empty for now. A script that takes a capability keyword and runs the tier-1 grep
recipes across `src/` (schema, routers, lib, components, schemas) and prints ranked in-repo
hits would justify one once the recipe set proves stable and low-noise across real repos.
