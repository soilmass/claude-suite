Purpose: run the dependency scan correctly per package manager, then triage each advisory by edge exploitability and reachability rather than raw CVSS.

# 1. Run the scan correctly

The #1 silent failure is a scan that ran on the wrong tree. Always scan against the committed
lockfile, and view the production and dev trees separately — they triage into different buckets.

## npm
```bash
npm audit --json                 # everything
npm audit --omit=dev --json      # production-only tree (what ships)
npm audit --json | jq '.vulnerabilities | to_entries[] | {name:.key, sev:.value.severity, via:.value.via, fix:.value.fixAvailable}'
```

## pnpm
```bash
pnpm audit --json
pnpm audit --prod --json         # production-only
```

## yarn (berry)
```bash
yarn npm audit --all --json
yarn npm audit --environment production --json
```

## Lockfile-agnostic (recommended cross-check)
```bash
npx osv-scanner --lockfile=pnpm-lock.yaml    # or package-lock.json / yarn.lock
```
`osv-scanner` reads the OSV database directly and catches advisories the registry audit may
lag on. Use it as a second opinion, not a replacement.

Note: `npm audit` reports against the registry's advisory db; CI may also surface Dependabot
(GitHub Advisory db) and Snyk. They overlap but are not identical — reconcile by advisory ID
(GHSA-xxxx maps to a CVE), not by count.

# 2. Inventory each advisory (before judging any)

For every finding capture: package, installed version, **GHSA/CVE id**, CVSS, patched range,
direct-vs-transitive, and the dependency path (`npm why <pkg>` / `pnpm why <pkg>`).

```bash
npm why postcss        # shows who pulls it in — needed to find the fixable parent
pnpm why undici
```

# 3. Reachability + runtime-surface rubric (the core judgment)

CVSS assumes worst-case generic deployment. Re-score for THIS edge app. Rank by the answers,
high to low:

| Question | Higher priority | Lower priority |
|---|---|---|
| Is the vulnerable export on a path the app calls? | yes, called | dead / unused export |
| Does that path run at the **edge** (request handling)? | edge runtime, per-request | build/dev/CI only |
| Is the input attacker-controlled? | parses untrusted request body/headers/params | internal/static only |
| Auth-gated? | reachable pre-auth (public route) | behind `protectedProcedure` |
| In the shipped bundle? | bundled to the edge | `devDependencies`, tree-shaken out |

Worked ranking: a **moderate** advisory in `cookie`/a pure-JS header parser that ships in the
edge bundle and runs on a **public route** outranks a **critical** in `postcss`/`eslint` that
only runs at build time. Reachability and runtime surface dominate the headline number.

Edge-specific notes:
- The edge bundle is Web-APIs-only; a Node-only flagged package may be genuinely unreachable
  at runtime (confirm it isn't bundled). If it IS imported into an edge route, that is its own
  defect — hand to `edge-runtime-constraints`.
- Dev-tree advisories still matter: they execute on developer and CI machines (supply-chain
  build-time compromise). Lower than edge-runtime, never "ignore."

# 4. Decision tree (one action per advisory)

```
Is the vulnerable path reachable in the shipped (edge) bundle?
├─ NO (dev/build-only or dead path)
│    ├─ patch exists  → bump in devDeps, low priority
│    └─ no patch      → accept with reason + expiry → security-pass
└─ YES (reachable at runtime)
     ├─ patch exists, direct dep      → minimal semver-safe bump, re-run tsc + audit
     ├─ patch exists, transitive
     │     ├─ parent has a release    → bump the parent
     │     └─ parent lags             → override/resolution the transitive version
     │                                   → RECORD in DECISIONS.md (id + reason)
     └─ no patch (reachable)          → mitigate: pin/isolate the call, or drop the dep;
                                         record accepted risk + expiry → security-pass
```

Prefer the **minimal** bump. Never `npm audit fix --force` in the gate — it pulls major
versions that break the type chain (Rule 1) or shared Zod boundaries (Rule 8); treat a major
as a deliberate upgrade on a branch, hand wide call-site changes to `refactor`.

# 5. Pinning a transitive fix (when the parent lags)

npm (`package.json`):
```json
{ "overrides": { "postcss": "^8.4.31" } }
```
pnpm (`package.json`):
```json
{ "pnpm": { "overrides": { "postcss@<8.4.31": "8.4.31" } } }
```
yarn (`package.json`):
```json
{ "resolutions": { "postcss": "^8.4.31" } }
```
Every override is a fork from the resolved tree → record in `DECISIONS.md` (advisory id, why
the parent can't be bumped, expiry to revisit). After applying: reinstall, re-run the audit to
confirm the count dropped, run `tsc` to confirm the type chain held, and check nothing new
appeared.

# 6. Re-verify

```bash
<pm> install
<pm> audit --omit=dev --json    # count must drop; no new advisories
npx tsc --noEmit                # Rule 1: a fix that breaks the type chain is not done
```
