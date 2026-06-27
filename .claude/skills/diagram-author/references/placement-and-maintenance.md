Purpose: where each diagram type lives in the repo, how to embed and link it, the keep-it-small rules, and the pre-commit render/leak/drift checklist that keeps diagrams honest.

## Placement: co-locate with what it describes

Co-location is the whole mechanism — a diagram next to its code is seen when the code changes,
so it gets updated in the same PR. A diagram in a far-off wiki is not.

| Diagram | Lives in | Linked from |
| --- | --- | --- |
| System / container architecture | `docs/architecture/containers.md` | root `README.md`, onboarding docs |
| Subsystem / feature flow (sequence) | the feature folder, e.g. `src/features/invoices/flow.md` | the feature's README or a code comment |
| Entity-relationship | `docs/architecture/data-model.md` or beside `src/db/schema/` | the schema folder README |
| One-off / decision illustration | inside the ADR (`adr-research` owns the doc) | the ADR itself |

Prefer a Markdown file holding the fenced ```mermaid``` block over a bare `.mmd` file: Markdown
renders inline on GitHub and lets you caption the diagram. Use `.mmd` only when a tool
(mermaid-cli) consumes it.

## Embedding and linking

- Always a fenced ```mermaid``` block — never a committed PNG/SVG export as the source of truth.
  If a rendered image is needed for a non-rendering surface, generate it from the fence in CI and
  treat the fence as canonical.
- Give every diagram a Markdown `##` title above the fence stating the one concern it shows.
- Cross-link rather than duplicate: an architecture doc links to the data-model doc instead of
  redrawing tables; a `technical-writing` guide embeds the diagram by reference.

## Keep it small

- **One concern per diagram.** A container view, a single request flow, or one bounded context's
  entities — not all three. If a diagram exceeds ~15-20 nodes, split it by concern.
- **Real identifiers as labels.** Node and participant labels match code: procedure names
  (`invoice.create`), table names (`invoices`), real files (`middleware.ts`). Generic boxes
  ("service", "database") hide what the reader needs.
- **Direction for readability.** `flowchart LR` for architecture (left-to-right request flow),
  top-down `erDiagram` default for data. Consistency across the repo's diagrams helps.

## Pre-commit checklist

Run through this before committing any diagram:

1. **Renders.** The fence parses in GitHub/IDE preview — no Mermaid syntax error. (A CI render
   step with mermaid-cli is the eventual automation; see SKILL.md Scripts.)
2. **Derived, not guessed.** Every node/participant/entity maps to a real artifact. ER tables and
   cardinality were read out of `src/db/schema/`, not memory (the schema conventions).
3. **Edge boundary present** (architecture diagrams): the edge `subgraph` exists; no long-lived
   pool, no server-only code shown inside a client node.
4. **Auth ≠ ownership** (sequence diagrams): authentication and the `ctx.auth.userId` ownership
   check are distinct steps (Rule 2).
5. **No leaks.** No real internal hostname, no key or token fragment, no PII in any label
   (Rule 9). Use generic service names.
6. **Perishables flagged.** Any label that dates (a tool version, a provider name) is noted so
   `perishable-refresh` can re-verify it.
7. **Choice recorded.** Any non-obvious modeling decision (why a boundary is drawn a certain way,
   why a relation is modeled as it is) goes in `DECISIONS.md`.

## Staying in sync

- A schema change PR that touches `src/db/schema/` should update the ER diagram in the same PR —
  treat a stale `data-model.md` as a review blocker.
- A routing/middleware change should update the affected sequence diagram.
- When a diagram and the code disagree, the **code wins**; redraw from it and treat the diagram
  as the defect, not the code.
