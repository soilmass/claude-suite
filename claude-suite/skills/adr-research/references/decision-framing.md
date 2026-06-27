Purpose: how to frame an architecture decision, scope its option set, and classify its reversibility before any evidence is gathered — the guardrails against researching the wrong question.

# Framing the decision

## 1. The one-sentence question

Write the decision as a single answerable question, not a topic. A topic ("background jobs")
invites a brochure; a question ("How do we run deferred work given the edge runtime has no
long-lived process?") invites options with consequences.

A good frame names:
- **The trigger** — what forced this decision now (a new feature, a limit hit, a cost).
- **The forces** — the things in tension (latency vs cost, lock-in vs speed, control vs ops).
- **The hard constraints** — the spine facts that any option MUST satisfy.

## 2. Check it isn't already decided — FIRST

Before researching, confirm the fork is open. Run, from the repo root:

```bash
grep -ri "<keyword>" DECISIONS.md docs/02-requirements/adrs/ 2>/dev/null
```

- If `DECISIONS.md` or an existing ADR already resolves it → **stop**. Cite the record. If the
  concern is that the record is stale, that is `perishable-refresh`'s job, not a re-research.
- The spine in `../../CLAUDE.md` is decided: Next.js App Router, Drizzle, Clerk edge
  middleware, tRPC, Tailwind v4, Zod, RHF, edge runtime. Never put a spine element up for
  re-decision here. Research the open forks *inside* the spine.

## 3. Hard-constraint checklist (a candidate that fails any is out, not down)

These are pass/fail gates derived from the spine — apply them before scoring anything:

- **Edge-runtime compatible.** No long-lived TCP pool, no Node-only built-ins at runtime,
  works under the Web/edge APIs. This is the fork-defining constraint; a TCP-only candidate is
  eliminated, not penalized.
- **Type-chain safe (Rule 1).** Ships real types or a typed client; doesn't force `any` at a
  boundary.
- **Validated boundary friendly (Rule 8).** Inputs/webhooks can be Zod-parsed.
- **No client-side secret (Rule 9).** Any key it needs stays server-only.
- **Rule-relevant gates** for the specific domain (money → Rule 5; time → Rule 6; data access
  → Rule 7).

# Enumerating options (MECE)

- List the genuinely distinct candidates. Two libraries that are the same architectural bet
  collapse into one row.
- **Always include the status quo / "do nothing" as option zero**, with its own consequences.
  Many decisions die correctly here: the cost of change exceeds the benefit.
- Name what you deliberately excluded and the one-line reason (out of budget, abandoned,
  fails a hard constraint). Excluding silently looks like you missed it.
- Aim for 2–5 live options. More than ~5 usually means the criteria aren't sharp yet.

# Reversibility — one-way vs two-way door

Classify the decision; it sets how much research is warranted:

- **Two-way door** (cheap to reverse — a cache strategy, a lint rule, a swappable adapter
  behind an interface): bias to action. Cap the research, lean, decide, move. Over-researching
  a reversible call is a failure mode of its own.
- **One-way door** (expensive to reverse — a data model, a datastore, a vendor with a data
  moat, a public API contract): research harder, demand tier-1 evidence on the decisive axis,
  and weight lock-in heavily.

# The recommendation lean (not a verdict)

This skill researches; it does not pronounce. End with a *lean*, framed so the ADR author owns
the call:

> **Lean:** Option X, driven by <the one decisive criterion>. **Flip to Y if** <the concrete
> condition that would change the answer>. **Reversibility:** two-way door / one-way door.

Never an unconditional "we should use X" with no flip trigger — that hands `draft-adr` a
conclusion to rubber-stamp instead of a decision to make.
