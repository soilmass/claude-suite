---
name: release-notes
description: >
  Turn a diff, a set of merged PRs, or a milestone into user-facing release notes: what changed
  framed as a benefit the reader gains, grouped so they can find what affects them, with explicit
  upgrade steps and breaking-change warnings. It exists to stop the release-note failure where the
  notes are a flattened commit log written in implementation terms, the upgrade path is missing,
  and breaking changes hide among features. Honors the product-voice and observability conventions
  in ../../CLAUDE.md.
  Use when: "release notes", "announce the release", "whats new", "release announcement".
  Do NOT use for: a raw chronological changelog from commit history (use changelog-from-commits),
  or conceptual guides / tutorials / how-tos (use technical-writing).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the internals-shaped release-note failure class: a flattened
    commit log in implementation terms, no upgrade steps, and breaking changes buried among
    features. Baseline section is the encoded failure class; replace with an observed transcript.
---

# release-notes

Turn a release boundary — a diff, a milestone, a batch of merged PRs — into notes a user reads to
answer one question: "what does this change for me, and what must I do?" The discipline is a
translation: every entry leads with the benefit or impact, not the internal mechanism; entries are
grouped so a reader finds their concern fast; and anything that requires reader action (breaking
change, migration, config) gets an explicit, ordered upgrade path. See ../../CLAUDE.md for the
product-voice and secret-hygiene conventions the prose must respect.

## When to Use

- A version or milestone is shipping and users (developers or end users) need to know what changed
  and whether they must act.
- You have raw material — a diff, a PR list, a `changelog-from-commits` output — and need it
  reframed from internals into reader-facing benefits and impacts.
- A breaking change, deprecation, or required migration ships and the upgrade steps must be spelled
  out so a reader can follow them without reading the code.

## When NOT to Use

- The deliverable is a raw, chronological, commit-derived changelog grouped by type → use
  `changelog-from-commits`, which owns mechanical history-to-changelog generation (this skill
  consumes its output).
- The deliverable is a conceptual guide, tutorial, or how-to explaining how to use a feature in
  depth → use `technical-writing`, which owns reader-task documentation.
- The deliverable is the deploy/rollback operational sequence for the release itself → use
  `rollback-runbook` / `deploy-edge`; release notes describe user impact, not ops steps.

## Procedure

1. **Establish the boundary and the audience (interrogation: medium).** Fix the exact range
   (`v1.3.0..v1.4.0`, a milestone, a tag) and name who reads these notes — API consumers, end
   users, or both. Notes written for "everyone" lead with nothing. See `references/structure.md`.
2. **Gather and dedupe the raw material.** Prefer `changelog-from-commits` output or merged PR
   titles+bodies over a bare `git log`; collapse fixups and reverts to net change. A commit log is
   input, never the output. See `references/structure.md` for sourcing.
3. **Translate each entry from mechanism to benefit (interrogation: high).** Rewrite "added
   `cursor` param to `listInvoices`" as "Invoice lists now page smoothly past 50 items." The
   internal change is the cause; the user-visible benefit is the entry. See
   `references/benefit-translation.md`.
4. **Group by reader concern and surface breaking changes first.** Sections: Breaking changes,
   then New, Improved, Fixed, Deprecated, Security. Breaking and Security never hide among features
   — a missed breaking change is a broken upgrade. See `references/structure.md`.
5. **Write the upgrade path as explicit ordered steps (interrogation: high).** For every breaking
   change and required migration, give numbered steps the reader follows without reading source.
   If a schema migration ships, reference the expand-contract sequence and link the
   `migration-author` output; record any non-obvious upgrade decision in `DECISIONS.md`. See
   `references/benefit-translation.md`.
6. **Scrub for leaked internals and secrets.** No internal table names, ticket IDs, employee
   names, or stack traces as reader-facing copy; never paste a key or a `NEXT_PUBLIC_` misuse into
   a sample (Rule 9). Use placeholders. See `references/structure.md`.
7. **Draft in product voice; flag for human review.** Voice is a human-pass concern per
   ../../CLAUDE.md — draft it well, mark it draft. Flag any version-specific or perishable claim
   (minimum supported version, dated deprecation window) for `perishable-refresh`.

## Composes With

- **Consumes:** `changelog-from-commits` (its grouped commit changelog is the primary raw input
  this skill reframes into benefits).
- **Pairs with:** `technical-writing` (deep how-tos that release-note entries link out to instead
  of inlining), and `draft-launch-comms` when the release is a launch needing broader announcements.
- **Hands off:** upgrade decisions to `DECISIONS.md`; perishable version claims to
  `perishable-refresh`; migration upgrade steps reference `migration-author` output.

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project
> conventions). The encoded failure class was confirmed.

**Observed run.** Asked to write release notes from recent commit history, the naive agent
invented a "v2.0.0" boundary that exists nowhere in the repo (no tag, no package version) and
took the commit subjects' counts at face value as user-facing facts. It never consulted this
`release-notes` skill or `changelog-from-commits`, and the "What's New" section is a lightly
reworded commit dump rather than translated benefits:

```
### Skills
- Evaluated baselines for the testing, devops, and database skills (now 51/72).
### Hooks
- Two hook fixes for stability.
```

It also asserted a major-version bump while noting "No breaking changes" — a contradiction with
no semver justification — and invented speculative upgrade steps (`git pull`, re-copy `.claude/`).

**Failure class (confirmed).** Without this skill, release notes become a flattened, fabricated
commit log: an unverified version and counts, internal commit subjects passed off as user
benefits, no real audience translation, and an upgrade path guessed rather than grounded. Breaking
changes and semver are hand-waved instead of derived from the actual change set.

## Examples

- **Input:** `changelog-from-commits` output for `v1.3.0..v1.4.0` including
  `feat(invoices): cursor pagination` and `feat!: rename CLERK_SECRET to CLERK_SECRET_KEY`. →
  **Output:** A Breaking changes section first — "Rename the `CLERK_SECRET` env var to
  `CLERK_SECRET_KEY`" with numbered upgrade steps and a rollback note — then an Improved entry:
  "Invoice lists now load instantly past 50 rows." Internals named only where the reader must act.

- **Input:** "Announce the v2 dashboard release to end users." → **Output:** Benefit-led, no
  internal grouping: "See spend by category at a glance," "Export any view to CSV," each one
  sentence on what is new for the reader, with a short upgrade note ("no action needed — changes
  are live") and a link to the `technical-writing` how-to for the new export flow.

- **Input:** "Just paste the git log into the notes." → reframed: a git log is raw input, not
  release notes. Run `changelog-from-commits` first, then translate each net change to a benefit
  and pull breaking changes to the top.

## Edge Cases

- **A schema migration ships in the release** → describe the user-facing impact and link the
  `migration-author` expand-contract steps; do not re-document the SQL, and note rollback.
- **The diff is huge and mostly internal refactors** → most entries collapse to zero user-facing
  notes; say "internal improvements and performance" once rather than listing every refactor.
- **A security fix ships** → put it under Security with the impact and the minimum safe version,
  but do not disclose exploit details before the patch window closes (coordinate with `security-pass`).
- **No real audience is defined** → stop and ask; notes for API consumers and notes for end users
  are different documents and merging them serves neither.

## References

- `references/structure.md` — the boundary/audience framing, where to source raw material,
  the section order (breaking → security first), and the internals/secret scrub checklist.
- `references/benefit-translation.md` — the mechanism-to-benefit rewrite patterns with
  before/after examples, and the upgrade-path template for breaking changes and migrations.

## Scripts

Reserved; empty for now. A PR-range collector — calling the GitHub API for merged PR titles,
labels, and `BREAKING CHANGE` footers between two tags — would justify a script once the release
process settles on a consistent label and footer convention.
