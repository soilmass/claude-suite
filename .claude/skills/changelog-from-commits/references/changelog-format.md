Purpose: the Keep a Changelog entry layout, a worked before/after template, and the prepend-don't-overwrite and UTC-date rules.

## Entry layout (Keep a Changelog, semver-tagged)

```markdown
## [1.4.0] - 2026-06-26

### ⚠ BREAKING CHANGES

- **api:** the `X-Api-Key` header is no longer accepted; send `Authorization: Bearer <token>`. (a1b2c3d, #412)

### Features

- **billing:** add invoice proration for mid-cycle plan changes (e4f5a6b, #401)

### Bug Fixes

- **auth:** handle expired session tokens without a 500 (c7d8e9f, #408)

### Performance

- **query:** batch invoice lookups to remove an N+1 (#410)

### Reverts

- revert "feat(search): fuzzy matching" — regressed exact-match ranking (9a8b7c6)
```

Rules for the layout:

- **Heading:** `## [<version>] - <YYYY-MM-DD>`. The version is the computed bump; the date is
  the release date.
- **BREAKING section first**, always, when any breaking change exists. Quote the
  `BREAKING CHANGE:` footer text or describe the `!` change.
- **Section order:** ⚠ BREAKING CHANGES → Features → Bug Fixes → Performance → Reverts →
  Internal (if shipped). **Omit any empty section.**
- **Bullet shape:** `- **<scope>:** <subject> (<short-hash>, <#PR/issue>)`. Drop `**scope:**`
  when the commit had no scope. Drop the parenthetical when no hash/ref is available.
- **Subject:** keep the commit subject; lightly clean it to imperative present tense if needed,
  but do not invent claims not in the commit.

## Prepend, don't overwrite

`CHANGELOG.md` is append-at-top. A typical file:

```markdown
# Changelog

All notable changes to this project are documented here. Format: Keep a Changelog;
versioning: Semantic Versioning.

## [Unreleased]

## [1.4.0] - 2026-06-26
...new entry goes here, above prior entries...

## [1.3.2] - 2026-05-30
...prior entry, preserved verbatim...
```

- Insert the new version block **immediately below** the `## [Unreleased]` marker (or below the
  top intro if there is no Unreleased marker), **above** the most recent prior version.
- Never rewrite, reflow, or reorder existing entries — they are a historical record.
- If working from an `## [Unreleased]` accumulation, promote those bullets into the new dated
  version block and leave `## [Unreleased]` empty for the next cycle.

## Dates are UTC

Apply the project's Rule 6 timestamp discipline to the document itself: dates are UTC, ISO
`YYYY-MM-DD`. Compute from the tag/release moment in UTC, not the author's local zone — a
contributor in UTC+9 must not date an entry a day ahead of one in UTC-5.

## Before / after

**Before (the failure):**

```markdown
## v1.4.0
Various fixes and improvements, plus a new billing feature. Updated some dependencies.
```

**After (this skill):** the grouped block above — breaking change surfaced, bump justified by
the `feat`, deps demoted out of the user-facing list, every change traceable to a hash.
