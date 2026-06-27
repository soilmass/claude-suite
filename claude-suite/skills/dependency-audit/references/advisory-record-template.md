Purpose: the standard shape for a triaged advisory and the DECISIONS.md lines for an override or accepted risk, so triage output is auditable and feeds security-pass.

# Triaged advisory entry

One block per advisory in the audit. The ranking field is the *reachability-adjusted*
priority from the rubric, not the raw CVSS.

```
Advisory:     GHSA-xxxx-xxxx-xxxx (CVE-2025-NNNNN)
Package:      cookie @ 0.6.0  (transitive via next → cookie)
CVSS:         6.5 (moderate)
Patched in:   >=0.7.0
Dependency:   transitive
Reachable?:   yes — pure-JS, in the edge bundle; parses the attacker-controlled Cookie header in middleware on every public route
Runtime:      edge, per-request, pre-auth
Rank:         HIGH (reachable, edge, attacker-influenced input) — outranks higher-CVSS dev-only finding
Action:       bump (minimal): override cookie to ^0.7.0; re-run tsc + audit
Status:       fixed | pending | accepted
```

# Ranked output (what the skill returns)

A table, ordered by reachability-adjusted rank, not CVSS:

| Rank | Advisory | Package | CVSS | Reachable / runtime | Action |
|------|----------|---------|------|---------------------|--------|
| HIGH | GHSA-…    | cookie  | 6.5  | yes / edge, public  | bump → ^0.7.0 |
| MED  | GHSA-…    | postcss | 9.8  | no / build-only     | override parent, log |
| LOW  | GHSA-…    | node-forge | 7.5 | no / seed script   | move to devDeps + accept |

# DECISIONS.md lines

For a transitive override (a fork from the resolved tree):
```
2026-06-26 — Pinned transitive `postcss` to ^8.4.31 via pnpm overrides (GHSA-xxxx). Parent
@tailwindcss/postcss has not yet released with the patched range; build-time only, not in the
edge bundle. Revisit/remove when the parent ships >=N. Expiry: 2026-09-26.
```

For an accepted risk (reachable-but-no-fix, or unreachable-no-fix):
```
2026-06-26 — Accepted GHSA-yyyy in `node-forge@1.3.1` (CVSS 7.5). Used only in the DB seed
script (devDependency), never bundled to the edge, not on any request path. No patched version
available upstream. Expiry: 2026-09-26 — re-audit then; drop the dep if a maintained
alternative exists.
```

Every accepted advisory MUST have a one-line reason and an explicit expiry, and is handed to
`security-pass` as an input to the launch threat model — not buried in an `audit-ci`/`audit.json`
allowlist with no rationale.

# Hand-off note to security-pass

When the audit closes, give `security-pass`: (1) the scan ran on prod + dev trees against the
committed lockfile (command + date), (2) the count after fixes, (3) the list of accepted
advisories with reasons and expiries. `security-pass` confirms the gate ran; it does not
re-triage.
