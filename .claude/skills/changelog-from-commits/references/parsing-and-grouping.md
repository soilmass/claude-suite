Purpose: the Conventional Commits grammar, the body-preserving git invocation, the type→heading routing table, and the deterministic version-bump algorithm.

## Conventional Commits grammar

```
<type>[optional (scope)][!]: <subject>

[optional body]

[optional footer(s)]   # e.g. BREAKING CHANGE: <desc>, Refs: #123, Co-authored-by: ...
```

- **type** — lowercase noun: `feat`, `fix`, `perf`, `refactor`, `docs`, `style`, `test`,
  `build`, `ci`, `chore`, `revert`.
- **scope** — optional, in parens: `feat(billing)`. Becomes the bullet's prefix.
- **`!`** — breaking marker after type/scope, before the colon: `feat(api)!:`. Forces a major
  bump on its own, with or without a footer.
- **`BREAKING CHANGE:`** (or `BREAKING-CHANGE:`) — a footer; its text is the migration note.
  A breaking footer forces a major bump **regardless of the type** (even `fix:` or `docs:`).

## git log invocation that preserves bodies

Bodies and footers are required to catch `BREAKING CHANGE:`. Do not use `--oneline` — it drops
them. Use a record separator so each commit is parseable as a unit:

```bash
LAST=$(git describe --tags --abbrev=0)
git log "$LAST"..HEAD \
  --no-merges \
  --pretty=format:'%x1e%H%x1f%s%x1f%b' \
  # %x1e = record sep (per commit), %x1f = field sep; fields: full-hash, subject, body
```

- `--no-merges` keeps merge commits out; for squash-merge workflows the PR title lands in `%s`.
- Split records on `\x1e`, fields on `\x1f`. Parse `%s` against the grammar above; scan `%b`
  for a line starting `BREAKING CHANGE:` / `BREAKING-CHANGE:`.
- Short hash for display: first 7 chars of `%H`. PR/issue refs: regex `#\d+` from subject/body.
- Ignore trailers `Co-authored-by:`, `Signed-off-by:` when extracting the breaking footer.

## Type → heading routing

| type | heading | user-facing? |
|------|---------|--------------|
| `feat` | Features (Added) | yes |
| `fix` | Bug Fixes (Fixed) | yes |
| `perf` | Performance | yes |
| `revert` | Reverts | yes |
| `refactor` | Internal | collapsed/omitted |
| `docs` | Documentation | usually omitted |
| `build`, `ci` | Internal | omitted |
| `chore`, `style`, `test` | Internal | omitted |
| *(unparsed)* | Other / unparsed | flag count |

Whether the Internal section ships in a consumer-facing changelog is a project policy fork —
record it in `DECISIONS.md`. Default for a public package: omit Internal; keep it for an
internal app changelog.

## Version-bump algorithm (highest precedence wins)

Evaluate over all parsed commits in the range, in this order; the first match decides:

1. Any commit with `!` **or** a `BREAKING CHANGE:` footer → **major** (`X+1.0.0`).
2. Else any `feat` → **minor** (`x.Y+1.0`).
3. Else any `fix` or `perf` → **patch** (`x.y.Z+1`).
4. Else → **no release** (only internal churn; do not cut a version).

Pre-1.0.0 caveat: many projects treat breaking as minor and feat/fix as patch while `0.x`.
If the project is pre-1.0, confirm the convention and record it in `DECISIONS.md` rather than
assuming. Always state the computed bump **and** the specific commit that forced it.

## Reverts

Pair a `revert: <subject>` (or body `This reverts commit <hash>`) with its target if the
target is in the same range. If they cancel, omit both from user-facing sections and note the
net-zero under Internal — never advertise a feature that was reverted before release.
