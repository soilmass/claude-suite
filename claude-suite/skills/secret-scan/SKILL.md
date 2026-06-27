---
name: secret-scan
description: >
  Scan a repo for secrets that have leaked or are about to leak: a secret riding a
  `NEXT_PUBLIC_` prefix, a server key imported into a Client Component, a `.env`/credential
  file committed to git, or a hardcoded token in source. Detection-and-triage for Rule 9 (no
  secrets client-side / committed) — it greps the working tree and git history, classifies
  each hit by exposure, and tells you what to rotate. It finds existing leaks; it does not
  design the env boundary that prevents them.
  Use when: "scan for secrets", "secret leak", "did I commit a key", "NEXT_PUBLIC secret".
  Do NOT use for: designing the typed env schema / server-client split (use env-validation),
  or the full feature abuse/threat-model and header review (use security-pass).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the "secret reaches the browser bundle or git history"
    failure class — NEXT_PUBLIC leaks, keys in client components, committed .env.
    Baseline section is the encoded failure class; replace with an observed transcript.
---

# secret-scan

A secret only has to leak once: a `NEXT_PUBLIC_`-prefixed key is inlined into every JS bundle
the browser downloads, and a committed `.env` lives in git history forever even after you
delete the file. This skill is the detection-and-triage pass for Rule 9 in `../../CLAUDE.md` —
it scans the working tree and history for the four leak shapes, classifies each by exposure
(shipped to browser / in history / staged / local-only), and names what to rotate. It finds
leaks; `env-validation` builds the boundary that stops new ones.

## When to Use
- Before a commit, push, or first public release — "did I commit a key?"
- A `.env`, `*.pem`, service-account JSON, or credential file may have been committed.
- Auditing for `NEXT_PUBLIC_`-prefixed values that are actually secrets.
- A server key (Clerk secret, DB URL, Stripe secret) may be reachable from a Client Component.
- After a contributor reports a token appeared in a log, a bundle, or a screenshot.

## When NOT to Use
- Designing the typed `env` module and the server-vs-`NEXT_PUBLIC_` split → `env-validation`.
- The "how would this be abused" threat model and security-header review → `security-pass`.
- Auditing the other eight inviolable rules across a diff → `rule-audit` (Rule 9 overlaps;
  this skill goes deeper — history scrubbing, rotation, allowlist tuning).
- Confirming the CI dependency scan ran → `security-pass` (this scans your code, not deps).

## Procedure

1. **Scan the working tree for the four leak shapes (medium cost — a miss ships the secret).**
   Grep tracked files for: high-entropy/known-prefix tokens (`sk_`, `whsec_`, `AKIA`,
   `eyJ`-JWTs, PEM headers), secret-looking values under a `NEXT_PUBLIC_` name, and server
   secret imports inside `"use client"` files. Use the pattern set in
   `references/scan-patterns.md`; do not eyeball — run every pattern.

2. **Scan git history, not just the current tree (high cost — deletion is not removal).** A
   secret deleted in HEAD still sits in every prior commit and is recoverable. Run
   `git log -p`/`git grep` across history and check whether `.env*` was ever tracked. Commands
   in `references/scan-patterns.md`. A hit here escalates step 5 to mandatory rotation.

4. **Classify every hit by exposure, worst-first (high cost — drives urgency).** Order:
   (a) shipped to the browser bundle (`NEXT_PUBLIC_` secret, or key in a Client Component) —
   already public, rotate now; (b) committed to history on a pushed branch — public to anyone
   with repo access; (c) staged/uncommitted — catchable; (d) local `.env`, untracked — verify
   it is gitignored. Triage matrix in `references/remediation.md`.

5. **Separate true positives from noise (low cost, but high noise wastes trust).** A `.env.example`
   with placeholder values, a test fixture token, or a public publishable key (`pk_`,
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`) is not a leak. Confirm each hit is a real secret before
   alarming; record intentional safe matches in an allowlist (`references/scan-patterns.md`).

6. **For each real leak, rotate first, then scrub (high cost — order matters).** Assume any
   exposed secret is compromised: rotate/revoke the credential at its provider BEFORE removing
   it from code, because the old value is already out. Then move it into the validated `env`
   module (hand off to `env-validation`) and purge it from history if it was committed
   (`git filter-repo` / BFG) — see `references/remediation.md`.

7. **Close the boundary so it cannot recur (medium cost).** Confirm `.env*` (except
   `.env.example`) is gitignored, recommend a pre-commit secret hook / CI scan, and route the
   value through the typed `env` server block. Record any accepted-risk exception (e.g. a
   tolerated history artifact that cannot be rewritten) in `DECISIONS.md`.

## Composes With
- **Consumes:** `env-validation` — leaks found here are re-homed into its typed `env` module
  with the correct server-vs-`NEXT_PUBLIC_` placement; rotation lands a clean value there.
- **Pairs with:** `security-pass` — this is the mechanical secret sweep; `security-pass` is the
  judgment pass that also checks headers, abuse cases, and the dependency scan.
- **Hands off:** `rule-audit` covers Rule 9 at diff level; escalate a confirmed leak here.

## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)
> Encoded failure class, not a captured transcript; replace once observed in the wild.

**Failure class encoded:** Asked "scan the repo before we go public," the agent runs a shallow
`grep -i password` over `src/` and declares it clean. Concrete defects that ship: (1) misses
`NEXT_PUBLIC_STRIPE_SECRET_KEY` because it never checked that a `NEXT_PUBLIC_` value is a
secret (Rule 9) — the key is already in every browser bundle; (2) never scans git history, so
a `.env` committed three weeks ago and "deleted" stays fully recoverable; (3) misses
`import { env } from "@/env"; ... env.CLERK_SECRET_KEY` used inside a `"use client"` component,
shipping the server secret to the client; (4) flags `.env.example` placeholders and a `pk_test`
publishable key as leaks, drowning the real hit in noise; (5) suggests "delete the line" without
rotating the credential, leaving the already-exposed key live.

## Examples

**Input:** "We're about to make the repo public — scan for secrets."
**Output:** Working-tree grep flags `whsec_…` hardcoded in a webhook route and a
`NEXT_PUBLIC_DATABASE_URL`. History scan shows `.env` was committed in an early commit.
Classify: the `NEXT_PUBLIC_` URL and `.env` are browser/history-exposed (rotate now); the
webhook secret is in history too. Rotate all three at the provider, move them into the `env`
server block (`env-validation`), `git filter-repo` the `.env` out of history, add `.env` to
`.gitignore`, recommend a pre-commit hook. Public publishable `pk_live_…` allowlisted, not flagged.

**Input:** "Did I commit my Clerk key?"
**Output:** `git log -p -S 'CLERK_SECRET_KEY'` finds it in commit `a1b2c3`. Exposure = history
on a pushed branch → compromised. Rotate the key in the Clerk dashboard immediately, replace
the literal with `env.CLERK_SECRET_KEY`, then scrub the commit from history and force-push with
team coordination. Record the rotation in `DECISIONS.md`.

**Input:** "Is `NEXT_PUBLIC_POSTHOG_KEY` a secret leak?"
**Output:** No — a PostHog *project* (publishable) key is designed to be public, like a Clerk
publishable key. Allowlist it. But verify nothing secret-shaped (a personal API key,
`phx_…`) was placed under a `NEXT_PUBLIC_` name by mistake (Rule 9).

## Edge Cases
- **Secret is in history but the branch was never pushed** → still rewrite history *before*
  the first push; rotation optional if provably never left the machine, but prefer rotating.
- **A publishable/public key matches a token pattern** (`pk_`, Clerk publishable, PostHog) →
  allowlist it; it is meant to be client-side. Do not treat every prefix hit as a leak.
- **Secret only appears in a minified `.next/` build artifact** → that artifact is generated
  from a `NEXT_PUBLIC_` var; fix the source classification, the build output is downstream.
- **History rewrite is infeasible** (huge shared repo, many forks) → rotate the secret so the
  committed value is worthless, document the residual artifact in `DECISIONS.md`, move on.

## References
- `references/scan-patterns.md` — the grep/`git grep`/`git log` command set for working tree
  and history, token-prefix and entropy patterns, the `NEXT_PUBLIC_`-secret and
  client-component checks, and the allowlist of intentionally-public values.
- `references/remediation.md` — the exposure triage matrix, the rotate-then-scrub order,
  `git filter-repo`/BFG history-purge recipes, and the recurrence-prevention checklist.

## Scripts
`scripts/` reserved. A single `scan.mjs` that runs the working-tree and history pattern set,
applies the allowlist, and exits with the number of unallowlisted hits would justify one once
the prefix/entropy heuristics prove stable across real repos (exit code = findings, per house
style). Empty for now — the patterns live in `references/scan-patterns.md` to run by hand.
