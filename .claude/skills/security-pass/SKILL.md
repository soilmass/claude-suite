---
name: security-pass
description: >
  Run the five-minute threat-model questions on a feature WITH the user, verify security
  headers, and confirm dependency scanning — the judgment parts of security a scanner
  can't do. Surfaces the "how would I abuse this?" risks only the person who knows the
  feature's intent can see.
  Use when: "security review", "threat model this", "is this secure", "before launch",
  "abuse cases", "check the headers".
  Do NOT use for: replacing the automated dependency scan (CI does that — this confirms it
  ran), the auth wiring itself (t3-genesis/vertical-slice), or non-security rules
  (rule-audit).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Third done-time gate. OWASP ordering and the "#2 risk" framing
    are dated facts maintained by perishable-refresh. Baseline section is the encoded
    failure class; replace with an observed transcript.
---

# security-pass

The third done-time gate. Uniquely, its interrogation *is* the deliverable: threat-
modeling surfaces risks only the person who knows the feature's intent can see, so this
skill walks the "how would I abuse this?" questions *with* the user rather than answering
them alone. The scanner-able parts (deps, headers) it verifies; the design-level abuse
question — the one that otherwise gets skipped entirely — it forces.

OWASP currency referenced here is kept fresh by `perishable-refresh`; treat the specific
orderings as perishable.

---

## When to Use
- A feature is feature-complete and headed for done/launch; part of the gate trio.
- The user asks whether something is secure or wants a threat model.

## When NOT to Use
- The automated dependency scan itself → CI (this confirms it ran).
- Auth wiring → `t3-genesis`/`vertical-slice`.
- Non-security rules → `rule-audit`.

---

## Procedure

1. **Walk the threat-model questions WITH the user (interrogation-as-the-method).** This
   is the skill. Ask, about this specific feature:
   - **Abuse:** "How would I misuse this if I wanted to? What's the worst a malicious
     authenticated user could do? An unauthenticated one?"
   - **Access control:** "Who should be able to do this, and does the code enforce
     *ownership*, not just authentication?" (ties to inviolable rule 2).
   - **Input boundary:** "What untrusted input crosses into this, and is every entry Zod-
     validated?" (rule 8).
   - **Data exposure:** "Does any response leak more than the caller should see (other
     users' rows, internal IDs, error internals)?"
   See `references/threat-questions.md`. The user's answers surface the design-level risks
   no scanner finds.

2. **Verify headers.** Confirm the security headers are set and correct (CSP, HSTS,
   X-Content-Type-Options, Referrer-Policy, frame protections). Header misconfiguration is
   a top risk and ships when defaults are assumed safe. See `references/headers.md`.

3. **Confirm the dependency scan ran.** Check that CI's dependency/vulnerability scan
   executed and is clean — this skill confirms, it does not replace the automated scan.

4. **Completeness check against the current OWASP priorities.** Confirm you covered:
   access control (incl. ownership), the input boundary, headers, dependency status, and
   data exposure — not a vague "looks secure." State which you checked.

5. **Suggest concrete mitigations; record accepted risks.** For each risk surfaced, give a
   specific mitigation (rate-limit this endpoint, scope this query by owner, strip this
   field from the response). Where the user knowingly accepts a tradeoff, record it in
   `DECISIONS.md` so it isn't later mistaken for an oversight.

---

## Composes With
- **Third of the done-time gate trio** with `rule-audit` and `a11y-gate`.
- **References** the same OWASP currency `perishable-refresh` keeps fresh.
- **Leans on** rule 2 (ownership) and rule 8 (validated boundaries) from `rule-audit`'s
  set — security-pass is the design-level complement to rule-audit's mechanical pass.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project conventions). The encoded failure class was confirmed.

**Observed run.** Shown an artifact with a planted `updateEmail` mutation, the naive
reviewer caught the obvious code-shaped defects — the IDOR (writing by caller-supplied
`input.userId`), the leaked Stripe secret in a client component, the weak `z.string()`
email, and the raw Drizzle return — and correctly called it not safe to launch. What it
missed is what this skill forces: it never asked the abuse question. No rate-limiting on
the email-change endpoint, and no abuse-case pass at all (enumeration, takeover-via-reset,
flooding) — only the flaws already visible in the diff.

```ts
.where(eq(users.id, input.userId))   // caller names the row
email: z.string()                    // no .email(), no normalize
```

**Failure class (confirmed).** A scan-the-diff review catches the defects that are
*present* in the code but is blind to the controls that are *absent* — rate limiting, abuse
and enumeration paths, the "how would I misuse this?" design question OWASP files under
insecure design. Nothing in a code-shaped read forces that pass, so it ships unasked; this
skill makes the abuse interrogation a required, explicit gate.

---

## Examples
**Input:** "Security review on the file-share feature before launch."
**Output:** Walks abuse questions with the user → surfaces that a share link is a
guessable sequential ID (anyone can enumerate others' files) → recommends UUIDv7 +
ownership-scoped access + signed URLs → verifies CSP and frame headers are set → confirms
the dep scan is green → records the team's decision to defer rate-limiting to v2 in
DECISIONS.md as an accepted risk.

---

## Edge Cases
- **User wants security-pass to "just tell them" if it's secure** → it can't; the abuse
  surface depends on intent only they know. Walk the questions; that's the method.
- **A surfaced risk is severe and unmitigated** → flag it as launch-blocking, don't bury
  it in a list; let the user decide with the severity explicit.
- **OWASP ordering referenced feels stale** → note it and suggest running
  `perishable-refresh`; don't assert a possibly-outdated ranking as current.

---

## References
- `references/threat-questions.md` — the five-minute abuse/access/input/exposure question
  set, per feature type.
- `references/headers.md` — the security headers to verify and their correct values for an
  edge/App-Router app.

## Scripts
`scripts/` reserved; the dependency scan and header probe live in CI, which this skill
confirms rather than reimplements.
