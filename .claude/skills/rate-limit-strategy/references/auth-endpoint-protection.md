Purpose: brute-force / credential-stuffing defense for auth endpoints — composite keying, progressive backoff, success-vs-failure counting, enumeration-safe responses, and CAPTCHA / step-up escalation, layered over clerk-auth-flows.

# Auth endpoint protection

The auth tier (sign-in, sign-up, password-reset, OTP/verify) is the highest-cost-of-wrong
tier: too loose is a brute-force or credential-stuffing hole, too tight locks legitimate users
out of their own accounts. It needs more than a flat cap. This layers *on top of*
`clerk-auth-flows` — that skill wires the sign-in surface; this hardens it.

## The two attacks, and why a flat limit misses

- **Brute-force:** many guesses against *one* account from *one* origin. A per-IP cap catches
  it.
- **Credential-stuffing:** a few guesses against *many* accounts from *many* IPs (a botnet
  replaying leaked passwords). A per-IP cap misses it entirely — each IP stays under the
  limit. Only a per-*identifier* cap catches it.

That is why the auth tier keys on a **composite** (validated IP *and* hashed submitted
identifier), enforcing both independently — see `keying-and-algorithms.md`.

## Progressive backoff

A flat "5 per 15 minutes" lets an attacker make 5 guesses every 15 minutes forever. Escalate
the penalty per *consecutive failure* so cost grows for an attacker but a fat-fingered user
recovers quickly:

| Consecutive failures | Lockout before next attempt |
|----------------------|-----------------------------|
| 1–2 | none |
| 3 | 30 s |
| 4 | 2 min |
| 5 | 15 min |
| 6+ | 1 h, alert |

Implement as a per-identifier counter (TTL'd in the same Upstash store) read alongside the
limiter; convert the count to a delay and return `Retry-After`. Record the chosen curve in
`DECISIONS.md`.

## Count failures and successes differently

The backoff counter must track *failed* attempts, not all attempts:

- On a **failed** auth → increment the consecutive-failure counter.
- On a **successful** auth → reset it to zero.

If you count all attempts equally, a user who logs in successfully still accumulates toward a
lockout, and a legitimate active session gets punished. The signal is *failures in a row*.

## Enumeration-safe responses

The limiter must not become an account-existence oracle. Keep responses uniform:

- Same error shape and **same timing** whether the account exists or not — never "no such
  user" vs "wrong password", and never a faster reject for a non-existent account.
- The `429` / lockout response must not reveal whether the identifier is real. Lock on the
  *attempt rate*, not on "this real account is under attack."
- Never log the raw submitted email/password; key and log on the hash (Rules 8, 9).

## CAPTCHA / step-up escalation

Past a threshold (e.g. 3 consecutive failures, or an IP over its cap), escalate rather than
only delaying:

- Require a CAPTCHA / proof-of-work on the next attempt, or
- Trigger Clerk's step-up / bot-protection challenge.

Escalation degrades the attacker's automation while letting a real human continue. Expose this
as a hook the auth handler checks (`requiresChallenge(idHash, ip)`), wired into the
`clerk-auth-flows` sign-in surface — do not re-implement Clerk's challenge UI here.

## Failure mode

The auth tier is **fail-closed**: if the limiter store is unreachable, deny and surface a
retryable error. A brief outage rejecting logins is acceptable; an *unmetered* auth endpoint
during the outage is an open brute-force window. See `endpoint-tiers.md`.
