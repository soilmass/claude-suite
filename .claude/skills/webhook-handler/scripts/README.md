# webhook-handler scripts

## `webhook-lint.mjs`

Heuristic static check for an inbound-webhook route handler. Catches the mechanically detectable
half of the webhook failure class so a reviewer can spend attention on the semantic half.

### Usage

```sh
node webhook-lint.mjs src/app/api/webhooks            # a directory tree
node webhook-lint.mjs src/app/api/webhooks/stripe/route.ts   # one file
```

### What it flags

| Pattern | Why |
| --- | --- |
| `req.json()` in the handler | raw bytes the signature is computed over are lost — use `req.text()` |
| secret under `NEXT_PUBLIC_*` | client-exposed secret (Rule 9) |
| `process.env.*_SECRET` at the call site | bypasses the validated `env` boundary (Rule 8) |
| `evt: any` / `as any` | verified body is `unknown`, must be Zod-parsed (Rules 1/8) |

### Limits (read before trusting a 0)

- It is line-grep heuristic, not a parser: it can false-positive (e.g. a `req.json()` in an
  unrelated non-webhook handler passed in) and false-negative (an aliased body read).
- It does **not** check the load-bearing semantics: that verification happens **before** parsing,
  that the comparison is constant-time, or that processing is deduped on the event id. Those stay
  a manual `rule-audit` / `security-pass` review.
- **Exit code = number of findings.** `0` means "no red flags in these files", not
  "verified-and-idempotent".
