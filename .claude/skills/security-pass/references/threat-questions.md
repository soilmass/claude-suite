# The five-minute threat-model questions

Walk these WITH the user, per feature. The answers surface design-level risks no scanner
finds. Dated to current OWASP priorities (perishable — perishable-refresh maintains).

## Abuse (the question that otherwise gets skipped)
- If I wanted to misuse this feature, how would I? Walk one concrete abuse path.
- Worst thing a malicious *authenticated* user could do here?
- Worst thing an *unauthenticated* user could do?
- Can this be automated/enumerated (sequential IDs, no rate limit, scrapeable)?

## Access control (OWASP "Broken Access Control" — perennially #1)
- Who *should* be able to do this?
- Does the code check *ownership* (row belongs to ctx.auth.userId), not just that the
  user is logged in? (Inviolable rule 2.)
- Are there object references (IDs in URLs/params) a user could swap to reach another
  user's data? (IDOR.)

## Input boundary (OWASP Injection / Insecure Design)
- What untrusted input crosses into this (tRPC input, route params, webhook bodies,
  uploaded files, env)?
- Is every entry Zod-validated before use? (Inviolable rule 8.)
- File uploads: type/size validated? stored off the app origin?

## Data exposure
- Does any response include more than the caller should see (other rows, internal IDs,
  full error/stack details, PII)?
- Are errors generic to the client and detailed only in server logs (which don't log PII
  — cost + privacy)?

## Per-feature-type prompts
- **Auth/account:** session fixation? password reset token reuse? email-change
  verification?
- **Payments/money:** amount tampering? replay? idempotency on charges? (money is integer
  minor units — rule 5.)
- **Sharing/links:** guessable tokens? revocation? expiry?
- **Admin actions:** privilege escalation path? audit trail?

Record any knowingly-accepted risk in DECISIONS.md.
