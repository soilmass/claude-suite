Purpose: triage a confirmed leak by exposure, rotate-then-scrub in the right order, purge git history, and close the boundary so it cannot recur.

# 1. Exposure triage matrix (worst first — this sets urgency)

| Exposure | What it means | Action |
| --- | --- | --- |
| **Shipped to browser** | `NEXT_PUBLIC_` secret, or server secret read in a `"use client"` file. Inlined into every JS bundle. | **Already public. Rotate now.** Reclassify as a server var. |
| **In history, pushed** | Committed to a branch that was pushed (or the repo is shared/forked). | **Rotate now.** Anyone with repo/fork/clone access has it. Then scrub history. |
| **In history, never pushed** | Committed locally only, provably never left the machine. | Rewrite history before first push. Rotate (strongly preferred). |
| **Staged / uncommitted** | In the working tree or index, not yet committed. | Remove before commit. Rotate only if it was ever displayed/shared. |
| **Local `.env`, untracked** | Real secret, but gitignored and never committed. | Not a leak. Confirm `.env*` is gitignored; no rotation. |

The cardinal rule: **once a secret is in a pushed commit or a browser bundle, treat it as
compromised.** Scrubbing history does not un-leak it — clones, forks, CI caches, and the
GitHub event API may still hold it. Rotation is what actually neutralizes the value.

# 2. Rotate FIRST, then scrub (order is load-bearing)

1. **Rotate / revoke at the provider** before touching code. The old value is already out;
   removing it from the repo does nothing to the live credential.
   - Clerk: regenerate the secret key in Dashboard → API Keys (publishable key is fine to keep).
   - Stripe: roll the secret key in Developers → API keys; the old key keeps working until you
     confirm the new one, so roll, deploy, then revoke.
   - Neon/Turso: reset the database password / rotate the connection token; update `DATABASE_URL`.
   - AWS: deactivate then delete the `AKIA…` access key, issue a new one.
   - Webhook signing secret (`whsec_…`): roll it at the provider and update the endpoint.
2. **Re-home the new value** into the validated `env` server block (hand off to
   `env-validation`) — never back into source. Replace the literal with `env.<NAME>`.
3. **Update every deploy environment** (Vercel/edge env vars, CI secrets) with the new value.
4. **Then** purge the old value from history (§3) and notify anyone with a clone to re-pull.

# 3. Purge from git history

Only needed when the secret was committed. Prefer `git filter-repo` (BFG is the older
alternative). Coordinate with the team — this rewrites SHAs and requires a force-push.

```bash
# Option A: git filter-repo (recommended). Remove a file from all history:
git filter-repo --invert-paths --path .env

# Replace a literal secret string everywhere it appears in history:
printf 'sk_live_REALSECRET==>REDACTED\n' > /tmp/replace.txt
git filter-repo --replace-text /tmp/replace.txt

# Option B: BFG.
bfg --delete-files .env
bfg --replace-text /tmp/replace.txt
git reflog expire --expire=now --all && git gc --prune=now --aggressive
```

After rewriting: `git push --force-with-lease` to every remote/branch, ask collaborators to
re-clone (rebasing onto rewritten history corrupts), and invalidate any CI build cache that
may hold the old objects.

# 4. Close the boundary (prevent recurrence)

- **Gitignore:** ensure `.env`, `.env.*` (except `.env.example`) , `*.pem`, `*.key`,
  `*service-account*.json` are in `.gitignore`. Add `.env.example` with key names and no values.
- **Correct placement:** the value lives only in the typed `env` server block; nothing secret
  under `NEXT_PUBLIC_`, nothing secret imported into a Client Component (Rule 9). See
  `env-validation`.
- **Pre-commit guard:** recommend a secret-scanning pre-commit hook (gitleaks/trufflehog) so
  the next leak is blocked locally, and a CI secret-scan job so a bypass is caught on push.
- **Provider secret-scanning:** enable GitHub push protection / secret scanning on the repo;
  it blocks known token shapes at push time.

# 5. Record the incident

Log a one-line entry in `DECISIONS.md`: date, what leaked, exposure class, that it was rotated,
and any residual artifact you chose not to scrub (e.g. history rewrite infeasible on a large
shared repo — rotation makes the committed value worthless, document and move on). This is the
audit trail `security-pass` looks for.
