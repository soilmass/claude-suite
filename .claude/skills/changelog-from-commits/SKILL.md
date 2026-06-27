---
name: changelog-from-commits
description: >
  Turn a range of Conventional Commits into a structured CHANGELOG entry: parsed by type,
  grouped under stable headings (Features, Bug Fixes, Performance, …), with BREAKING CHANGE
  callouts surfaced to the top and an accurate version bump derived from the commit types.
  It exists to stop the changelog failure where the log is a hand-waved prose summary that
  drops breaking changes, miscounts the semver bump, and mixes internal churn into a
  user-visible list. Operates on git history you already have. Honors ../../CLAUDE.md.
  Use when: "changelog", "generate changelog", "what changed", "release changelog".
  Do NOT use for: user-facing announcement prose with upgrade narrative (use release-notes),
  or the project's README overview and quickstart (use readme-author).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the dropped-breaking-change / wrong-bump failure class:
    prose summaries that lose BREAKING CHANGE footers, miscompute the semver bump, and leak
    chore/refactor noise into a user-facing list.
    Baseline section is the encoded failure class; replace with an observed transcript.
---

# changelog-from-commits

Compile a range of Conventional Commits into a deterministic, grouped CHANGELOG entry — not a
prose recap. The discipline is mechanical: parse each commit's `type(scope): subject`, route
it to its heading, hoist every `BREAKING CHANGE:` footer and `!`-marked commit to the top, and
derive the version bump from the highest-precedence change present. This skill prevents the
failure where a breaking change is buried in body prose, the bump is guessed, and refactors
and CI chores pad a list meant for consumers. See ../../CLAUDE.md for the surrounding voice
and documentation conventions; the product-voice pass on user-facing copy is a human concern.

## When to Use

- You are cutting a release and need the `CHANGELOG.md` entry for a commit range or tag span.
- You want to know what changed since the last tag and how it should bump semver.
- A CI or release step needs a reproducible changelog from `git log`, not a written narrative.
- You need breaking changes called out explicitly and grouped, not scattered through bodies.

## When NOT to Use

- The output is a human-readable announcement with migration narrative and "why it matters"
  framing → use `release-notes`, which consumes this skill's grouped entry as raw material.
- You are writing or refreshing the project overview, install steps, or usage docs → use
  `readme-author`.
- The history is not Conventional Commits and cannot be → this skill's parser has nothing to
  route; fix the commit discipline first or write the entry by hand.
- You need the semver tag applied and the release published → that is the release tooling's
  job; this produces the changelog text it includes.

## Procedure

1. **Pin the exact commit range (interrogation: medium).** Resolve the boundary —
   `<last-tag>..HEAD`, an explicit `vA..vB`, or `--since`. Guessing the range silently drops
   or double-counts commits; confirm the previous tag with `git describe --tags --abbrev=0`.
   See `references/parsing-and-grouping.md` for the `git log` invocation that preserves bodies.
2. **Parse each commit into type / scope / subject / breaking (interrogation: high on
   breaking).** Apply the Conventional Commits grammar: `type(scope)!: subject` plus
   `BREAKING CHANGE:` body footers. A missed `!` or footer is the single most costly defect
   here — a breaking change shipped as a feature. See `references/parsing-and-grouping.md`.
3. **Route types to stable headings; quarantine non-user-facing types.** `feat`→Features,
   `fix`→Bug Fixes, `perf`→Performance, `revert`→Reverts; `docs/style/refactor/test/build/
   ci/chore` default to a collapsed "Internal" section or are omitted from a consumer-facing
   log. Decide which policy this project uses and record it in `DECISIONS.md` if non-obvious.
4. **Hoist breaking changes to a top "⚠ BREAKING CHANGES" section.** Every `!` commit and
   every `BREAKING CHANGE:` footer gets a dedicated top-of-entry bullet with its description,
   in addition to appearing under its type. Breaking changes are never only inline.
5. **Derive the version bump from the highest-precedence change.** Any breaking → major; else
   any `feat` → minor; else any `fix`/`perf` → patch; else no release-worthy change. State the
   computed bump and the commit that forced it. See `references/parsing-and-grouping.md`.
6. **Render the entry in Keep a Changelog shape.** Version + ISO date heading
   (`## [1.4.0] - 2026-06-26`), BREAKING section first, then grouped headings, each bullet:
   subject, scope, short hash, and PR/issue refs. Drop empty sections. See
   `references/changelog-format.md` for the exact layout and a worked template.
7. **Prepend, never overwrite, and keep dates UTC.** Insert above the previous entry under the
   `## [Unreleased]` / top marker; preserve prior entries verbatim. Dates are UTC ISO
   (Rule 6 discipline applied to the document). Hand the result to `release-notes` if prose is
   wanted next.

## Composes With

- **Feeds:** `release-notes` — this produces the grouped, accurate raw entry; that skill turns
  it into audience-facing announcement prose with upgrade narrative.
- **Pairs with:** `readme-author` — when a release also updates the README's feature list or
  version badge, the two run together off the same commit range.
- **Hands off:** the resolved bump and changelog text to the release/tag tooling; the
  changelog-policy fork (which types are user-facing) to `DECISIONS.md`.

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project
> conventions). The encoded failure class was confirmed.

**Observed run.** Asked to generate a changelog from the 4 commits since the initial commit,
the naive agent invented a previous version out of thin air (no tag or `package.json` version
exists) and declared a MINOR bump because `feat(...)` lines were present — without noticing
that every `feat(baselines): ...` commit is internal QA churn (capturing baselines) with no
user-visible change. It then listed that internal churn in the user-facing changelog and
eyeballed the bodies for breaking changes rather than parsing `!`/`BREAKING CHANGE:` footers.

```
## [0.2.0] - 2026-06-26
### Features
- **baselines:** Evaluated testing, devops, and database lifecycle skills — captured observed
  baselines for 20 more skills (...). 51 of 72 skills now baselined.
- **baselines:** Captured naive-run baselines for 12 more generative skills (...).
NOTE: ... no prior git tag or package.json version exists, so the chosen version 0.2.0 ...
are guesses.
```

**Failure class (confirmed).** Without this skill the bump is guessed from a fabricated
previous version, internal `chore`/QA churn is paraded in a consumer-facing list, section
headings are improvised instead of the stable ordered set, and BREAKING-CHANGE precedence is
eyeballed rather than mechanically derived — exactly the dropped-breaking / wrong-bump /
churn-leak failures this skill exists to prevent.

## Examples

- **Input:** "Changelog since v1.3.2" over a range containing `feat(billing): add proration`,
  `fix(auth): handle expired session`, `perf(query): batch invoice lookups`, `chore: bump
  deps`. → **Output:** `## [1.4.0] - 2026-06-26` (minor bump, forced by the `feat`), an
  Added/Features bullet for proration, a Bug Fixes bullet for the session fix, a Performance
  bullet for the batched lookups, deps moved to Internal/omitted. No breaking section.

- **Input:** Range with `feat(api)!: require Authorization: Bearer` whose body has
  `BREAKING CHANGE: the X-Api-Key header is no longer accepted`. → **Output:** version bumped
  to the next **major**; a top `### ⚠ BREAKING CHANGES` section quoting the footer; the same
  change also under Features; the bump explicitly attributed to the `!` commit. Handed to
  `release-notes` for the migration write-up.

- **Input:** "What changed?" with no range given → reframed: resolve `git describe
  --tags --abbrev=0` for the last tag, propose `<last-tag>..HEAD`, and confirm before parsing.

## Edge Cases

- **A commit is not Conventional Commits format** → list it under an "Other / unparsed"
  bucket rather than silently dropping it; flag the count so commit discipline can be fixed.
- **A `revert:` commit cancels a `feat` in the same range** → pair them and omit both from the
  user-facing list, noting the net-zero in Internal; do not advertise a feature that no longer
  ships.
- **`BREAKING CHANGE:` footer present but the type is `fix`** → it is still a major bump and a
  top breaking bullet; the footer outranks the type for bump precedence (Rule: never let a
  breaking change degrade to patch).
- **Squash-merge PRs where the title is the only Conventional line** → parse the PR title, not
  the noisy body; pull the PR number for the ref and ignore co-author trailers.

## References

- `references/parsing-and-grouping.md` — the Conventional Commits grammar, the body-preserving
  `git log` invocation, type→heading routing table, and the bump-precedence algorithm.
- `references/changelog-format.md` — the Keep a Changelog entry layout, a worked before/after
  template, and the prepend-don't-overwrite / UTC-date rules.

## Scripts

Reserved; empty for now. A parser that runs the `git log` format, emits grouped JSON, and
exits with the computed bump would justify a script once the type→heading policy and the
unparsed-bucket handling stabilize for this project.
