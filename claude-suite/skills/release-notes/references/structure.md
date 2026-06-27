Purpose: the structural contract for release notes — boundary/audience framing, where to source raw material, the section order, and the internals/secret scrub checklist.

# Boundary and audience

Pin both before drafting:

- **Boundary:** an exact, reproducible range. A tag pair (`v1.3.0..v1.4.0`), a GitHub milestone, or
  a date range. Vague ("recent changes") produces notes that overlap or skip the previous release.
- **Audience:** name one primary reader. The two common ones differ sharply:
  - *API/SDK consumers* — care about endpoint/contract/env-var changes, types, deprecations, exact
    upgrade steps. They read tersely and act.
  - *End users* — care about what they can now do and what looks different. They skim for benefit.
- If both audiences genuinely need notes, write two documents (or two clearly separated sections),
  not one merged blur. Record the split decision in `DECISIONS.md` if non-obvious.

# Sourcing the raw material

Order of preference, best first:

1. `changelog-from-commits` output — already grouped by type and deduped. This is the intended
   input; this skill reframes it from internals to benefits.
2. Merged PR titles + bodies for the range — richer than commit subjects; PR bodies often carry the
   "why" and a `BREAKING CHANGE:` footer.
3. Conventional-commit subjects (`git log v1.3.0..v1.4.0 --no-merges`) — last resort; noisy.

Collapse to **net change**: a feature added then reverted in the same range is not an entry; three
fixups to one feature are one entry. Drop pure `chore`/`ci`/`build` noise unless it changes what a
user must install or support (e.g. a bumped minimum Node version is user-facing).

# Section order (breaking and security never buried)

Emit only the sections that have entries, always in this order:

1. **Breaking changes** — anything that forces reader action to keep working. Always first.
2. **Security** — fixes with user impact and the minimum safe version. (Coordinate disclosure
   timing with `security-pass`; do not publish exploit detail before the patch window closes.)
3. **New** — net-new capabilities.
4. **Improved** — existing things made better (performance, UX, ergonomics).
5. **Fixed** — bug fixes, framed by the symptom the user saw, not the internal cause.
6. **Deprecated** — still works, will be removed; give the removal version and the replacement.

Within each section, order by reader impact, not commit order. A one-line lead sentence before the
sections ("This release focuses on faster invoice lists and a renamed Clerk env var.") helps skimmers.

# Per-entry shape

- One entry = one net user-visible change. One sentence where possible.
- Lead with the benefit/impact; name the internal only when the reader must touch it (an env var, an
  endpoint, a config key).
- Link out, do not inline: deep usage → the `technical-writing` how-to; API specifics →
  `api-docs-from-trpc` output; migration mechanics → `migration-author` steps.

# Internals & secret scrub checklist

Before publishing, remove from reader-facing copy:

- Internal ticket IDs (`JIRA-1234`), employee/author names, internal Slack/URL references.
- Internal table, column, or service names — unless the reader genuinely interacts with them.
- Raw stack traces or error strings copied from commits.
- Any secret or key, and any `NEXT_PUBLIC_` misuse, in a sample (Rule 9 in ../../CLAUDE.md). Use an
  obvious placeholder (`<your-clerk-secret-key>`) and a one-line note on where the real value lives
  server-side.
- Speculative or unshipped features — notes describe what shipped in the boundary, nothing else.
