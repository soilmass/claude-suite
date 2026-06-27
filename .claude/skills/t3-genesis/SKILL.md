---
name: t3-genesis
description: >
  Scaffold a new project on the decided edge stack (Next.js App Router + Drizzle + Clerk
  edge middleware + tRPC + Tailwind v4 + Zod + RHF) wired to the conventions, with
  CLAUDE.md, DECISIONS.md, CI quality gates, and the token and auth layers seeded. Stands
  up the rails every other skill runs on.
  Use when: "start the project", "scaffold the app", "set up the stack", "new T3
  project", "bootstrap the repo", "initialize the codebase".
  Do NOT use for: building features (use vertical-slice), designing the schema (use
  schema-design), or generating the full token system beyond a starter (use design-tokens).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Retargeted to edge/Drizzle per DECISIONS.md: Clerk edge
    middleware, serverless DB driver, drizzle-kit. Baseline section is the encoded
    failure class; replace with an observed transcript.
---

# t3-genesis

Runs once, rarely. High value precisely because errors here propagate through the whole
build. Low-interrogation by design: the stack is decided (`../../CLAUDE.md`), it's cheap
to redo, and a scaffold that editorializes is noise. It asks only the few fork-defining
questions not already answered, confirms the decided stack rather than re-deciding it,
and seeds the guard files and gates.

---

## When to Use
- A new repository needs standing up on the decided stack.

## When NOT to Use
- Anything after the rails exist — features (`vertical-slice`), schema (`schema-design`),
  the full palette (`design-tokens`).

---

## Procedure

1. **Ask only the fork-defining unknowns (low-interrogation), one short batch:**
   - Project name.
   - **Is this edge-deployed?** — already YES for this project per DECISIONS.md; confirm
     rather than re-ask. (This is *the* fact that set Drizzle over Prisma.)
   - Existing repo, or greenfield?
   - The serverless DB host, if known (Neon / Turso class) — else leave the driver
     pending and note it.
   Confirm the decided stack; do not re-litigate it.

2. **Scaffold the structure** wired to conventions: App Router only (no `pages/`), tRPC
   root + context with Clerk auth on `ctx`, Drizzle setup in `src/db/` with the
   serverless driver, Tailwind v4 with a starter `@theme` block (hand the *full* token
   system to `design-tokens`), Clerk **edge** `clerkMiddleware` in `middleware.ts`.

3. **Seed the guard files:** copy/author `CLAUDE.md` and `DECISIONS.md` at the root
   (DECISIONS.md already carries the edge + Drizzle + driver entries).

4. **Seed the CI quality gates:** wire the three done-time gates (`rule-audit` script,
   `a11y-gate`, `security-pass` checklist) and the deterministic gates (performance
   budget at p75, dependency scan) into CI config so they fail the build, not just advise.

5. **Completeness check.** Before declaring done, confirm all present: guard files, CI
   gates, token starter, auth wiring, Drizzle/driver setup, App-Router-only layout. A
   scaffold missing any of these is incomplete.

6. **Suggest sparingly; record forced calls.** Don't editorialize. But flag any decision
   you had to make (e.g. which DB host, if you picked one) and record it in
   `DECISIONS.md`. Then hand off: "Rails are up. Next: `schema-design` for the data model,
   `design-tokens` for the full palette."

---

## Composes With
- **Runs first.** Calls `design-tokens` and `schema-design` as sub-steps or hands off to
  them. Everything else builds on what it stands up.

---

## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)
> Encoded failure class; replace with a real transcript.

**Failure class encoded:** Asked to "set up the stack," the agent scaffolds a generic T3
app that drifts from the decided forks: Prisma instead of Drizzle (fatal at the edge),
absent or wrong auth wiring, Pages-Router patterns creeping in, no token layer, no
`CLAUDE.md`/`DECISIONS.md`, and no CI gates — so nothing downstream has rails to run on.

---

## Examples
**Input:** "Scaffold the app, it's called Harbor, Neon for the DB."
**Output:** Confirms edge + Drizzle + Neon → scaffolds App Router, tRPC w/ Clerk context,
Drizzle + Neon serverless driver, Clerk edge middleware, Tailwind v4 starter theme →
seeds CLAUDE.md, DECISIONS.md (records Neon as the driver host), CI gates → completeness
check passes → hands off to schema-design and design-tokens.

---

## Edge Cases
- **Existing repo** → don't overwrite; integrate the missing rails and report what was
  already present.
- **DB host unknown** → scaffold driver-agnostic Drizzle, leave the driver pending, note
  it in DECISIONS.md.
- **User asks to change a spine decision during genesis** (e.g. "use Prisma after all")
  → that's a fork: surface the edge consequence, and if they confirm, record the reversal
  in DECISIONS.md rather than silently complying.

---

## References
- `references/scaffold-layout.md` — the directory layout and the edge-specific wiring
  (Clerk middleware, serverless driver, tRPC context) that differs from a Node T3 app.

## Scripts
`scripts/` reserved for an init script once the layout stabilizes across real runs.
Empty for now.
