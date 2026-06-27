---
name: diagram-author
description: >
  Author architecture, sequence, and entity-relationship diagrams as Mermaid kept in the repo
  next to the code they describe, so the picture is version-controlled, diffable in review, and
  rendered by GitHub/IDEs without an external tool. It encodes the failure where diagrams are
  drawn once in a screenshot or a SaaS canvas, drift from the code within a sprint, and lie to
  the next reader. The diagram reflects the decided edge stack in ../../CLAUDE.md — App Router,
  Drizzle, Clerk edge middleware, tRPC, the edge runtime boundary.
  Use when: "diagram", "draw the architecture", "sequence diagram", "mermaid", "er diagram".
  Do NOT use for: prose docs and conceptual guides (use technical-writing), or the evidence and
  trade-off analysis behind a decision (use adr-research).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the diagram-drift failure class: pictures that live outside
    the repo, drift from the code, and misrepresent the edge runtime boundary and ownership.
    Baseline section is the encoded failure class; replace with an observed transcript.
---

# diagram-author

Turn an architecture, flow, or data model into a Mermaid diagram committed beside the code it
describes — `docs/` for system-wide views, next to a router or schema file for local ones. The
discipline is one rule repeated: the diagram is **source in the repo**, not an exported image,
so it is reviewable in a PR diff and re-derivable from the code. Diagrams must match the spine
in ../../CLAUDE.md — most importantly the edge-runtime boundary and the auth/ownership flow —
because a diagram that misstates trust boundaries teaches the wrong mental model.

## When to Use

- A C4-style architecture / container view: Next.js App Router, the edge runtime boundary, the
  serverless DB driver (Neon/Turso), Clerk, tRPC, external services.
- A sequence diagram for a request flow: client → `clerkMiddleware` → tRPC procedure → ownership
  check → Drizzle → driver, or a Clerk webhook path.
- An entity-relationship diagram derived from the Drizzle schema in `src/db/schema/`.
- Any time a reviewer asks "what talks to what" or "what happens on this request" and a picture
  in the PR would settle it faster than prose.

## When NOT to Use

- The deliverable is explanatory prose, a guide, or a concept walkthrough → use
  `technical-writing` (a diagram may be embedded in it, but the prose owns the doc).
- The work is gathering evidence and weighing options for a decision → use `adr-research`; the
  resulting ADR may include a diagram this skill draws, but the analysis is not a diagram.
- The picture is a design mock / UI layout → that is a design concern, not a Mermaid diagram.
- A throwaay sketch in chat that no one will maintain → do not commit ceremony for it.

## Procedure

1. **Pick the diagram type from the question being asked (interrogation: low).** "What talks to
   what" → architecture (`flowchart`/`graph`). "What happens on this request, in order" →
   `sequenceDiagram`. "How is the data shaped" → `erDiagram`. Mixing them in one diagram is the
   most common defect. See `references/mermaid-patterns.md` for the three shapes.
2. **Derive the diagram from the code, not from memory (interrogation: high for ER).** An ER
   diagram is read out of `src/db/schema/` — tables, columns, and the foreign-key cardinality
   from the schema — never guessed. A sequence diagram is traced through the actual router
   and middleware. A wrong cardinality or a missing hop is worse than no diagram. See
   `references/mermaid-patterns.md`.
3. **Draw the edge-runtime boundary explicitly.** The fork-defining fact in ../../CLAUDE.md is
   the edge target. Use a `subgraph` for the edge runtime so the serverless/HTTP driver, no
   long-lived pool, and the server/client split are visible. A diagram that hides the boundary
   misrepresents the architecture. See `references/mermaid-patterns.md`.
4. **Show auth and ownership as distinct steps in request flows.** In a sequence diagram,
   `clerkMiddleware` authenticating and the procedure checking the row belongs to
   `ctx.auth.userId` are two separate arrows (Rule 2). Collapsing them reproduces the #1
   vulnerability mental model — that authentication is authorization. See
   `references/mermaid-patterns.md`.
5. **Place the file next to what it describes and link it (interrogation: low).** System views
   in `docs/architecture/`, a schema ER diagram beside or referenced from `src/db/schema/`, a
   flow diagram in the feature's folder. Co-location is what keeps it from drifting. See
   `references/placement-and-maintenance.md`.
6. **Keep it small and labeled.** One concern per diagram, a title, and node labels that match
   the real identifiers in code (procedure names, table names). A 40-node mega-diagram is
   unreadable and unmaintainable; split by concern. See `references/placement-and-maintenance.md`.
7. **Verify it renders and matches reality before committing.** Confirm the fenced ```mermaid```
   block parses (GitHub/IDE preview), every node maps to a real artifact, and no secret or
   internal hostname leaks into a label (Rule 9). Note any version-perishable label so
   `perishable-refresh` can re-check it. Record a non-obvious modeling choice in `DECISIONS.md`.

## Composes With

- **Pairs with:** `technical-writing` (its guides embed the diagrams this skill draws) and
  `adr-research` (an ADR's chosen-option section often carries an architecture diagram from here).
- **Consumes:** the Drizzle schema in `src/db/schema/` (for ER diagrams) and the tRPC routers +
  `middleware.ts` (for sequence diagrams) as the ground truth a diagram is derived from.
- **Hands off:** non-obvious modeling/labeling choices to `DECISIONS.md`; perishable labels
  (versions, service names that date) to `perishable-refresh`.

## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)

> This is the encoded failure *class* this skill prevents, not a captured transcript. Replace
> with a real diagram-gone-wrong transcript when one is observed.

**Failure class encoded:** without this skill, "draw the architecture" produces:

- A diagram exported as a PNG or drawn in an external SaaS canvas, living outside the repo,
  invisible in PR review, and stale within a sprint.
- An ER diagram drawn from memory with invented columns and wrong cardinality (a one-to-many
  shown as many-to-many), contradicting the actual Drizzle schema's relations.
- The edge-runtime boundary absent — a diagram showing a long-lived DB pool or server-only
  code in a client node, misrepresenting the fork-defining fact of the stack.
- A sequence diagram that collapses authentication and ownership into one "auth" box, teaching
  by picture that `protectedProcedure` alone is sufficient (Rule 2 violation as a mental model).
- A real internal hostname or a key fragment baked into a node label (Rule 9), or a 50-node
  diagram no reader can follow and no author will update.

## Examples

- **Input:** "Draw the architecture of the app." → **Output:** A committed
  `docs/architecture/containers.md` with a `flowchart` whose `subgraph "Edge Runtime"` holds
  the App Router server, tRPC, and the HTTP driver, with arrows out to Clerk and Neon/Turso —
  the edge boundary explicit, the client/server split shown, no exported image.

- **Input:** "Sequence diagram for creating an invoice." → **Output:** A `sequenceDiagram` in
  the feature folder: Client → `clerkMiddleware` (authenticate) → tRPC `invoice.create` → Zod
  parse (Rule 8) → ownership check on `ctx.auth.userId` (Rule 2, its own arrow) → Drizzle insert
  → driver → DB, with the auth and ownership steps visibly distinct.

- **Input:** "ER diagram for our schema." → **Output:** An `erDiagram` read directly from
  `src/db/schema/`, tables in `snake_case`, real columns, foreign keys drawn with correct
  cardinality (`USER ||--o{ INVOICE`), committed beside the schema and linked from its README.

## Edge Cases

- **The schema and a hand-drawn ER diagram disagree** → the schema in `src/db/schema/` wins;
  redraw from it and treat the old diagram as the bug.
- **The flow crosses the edge/server boundary in a non-obvious way** → annotate the boundary
  with a note and record the rationale in `DECISIONS.md`; do not leave it implicit.
- **The diagram would need a real service hostname or key to be accurate** → use a generic label
  ("DB driver", "Clerk") never a secret or internal URL (Rule 9).
- **The picture is genuinely throwaway** (a one-off in chat) → sketch it inline and skip the
  commit; co-location ceremony is only worth it for diagrams that will be maintained.

## References

- `references/mermaid-patterns.md` — copy-ready Mermaid for the three diagram types against this
  stack: an architecture flowchart with the edge `subgraph`, a request `sequenceDiagram` with
  distinct auth/ownership steps, and an `erDiagram` derived from a Drizzle schema.
- `references/placement-and-maintenance.md` — where each diagram type lives in the repo, how to
  embed and link it, the keep-it-small rules, the render/leak checklist, and how diagrams stay
  in sync with the code they describe.

## Scripts

Reserved; empty for now. A checker that renders every ```mermaid``` fence headlessly (mermaid-cli)
to catch parse errors in CI, and a linter that diffs `erDiagram` tables against `src/db/schema/`
to flag drift, would each justify a script once diagrams accumulate in-repo.
