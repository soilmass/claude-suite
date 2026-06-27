---
name: technical-writing
description: >
  Write clear product documentation — guides, tutorials, concept explainers, how-tos — in the
  product's voice, structured by audience and the task the reader is trying to finish, leading
  with the why before the how, with examples that actually run against this stack. It exists to
  stop the documentation failure where prose is organized around the system's internals instead
  of the reader's goal, examples are illustrative-but-broken, and the why is buried under steps.
  Honors the microcopy/voice and documentation discipline in ../../CLAUDE.md.
  Use when: "write the docs", "technical writing", "document this", "explain this in docs".
  Do NOT use for: API reference generated from tRPC procedures and Zod schemas (use api-docs-from-trpc),
  or the repository README / getting-started landing doc (use readme-author).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the system-shaped-docs failure class: prose organized by
    internals not reader task, buried why, and non-running examples that drift from the stack.
    Baseline observed (clean-room capture).
---

# technical-writing

Turn a feature, concept, or workflow into documentation a specific reader can finish a specific
task with. The discipline is one inversion repeated: organize by **who is reading and what they
are trying to do**, not by how the code is laid out; state **why** before **how**; and make
every example a real, runnable artifact from this stack, not pseudo-code. This skill prevents
docs that read like a guided tour of the source tree. See ../../CLAUDE.md for the product-voice
and observability/log-discipline conventions the prose must respect.

## When to Use

- A conceptual guide, tutorial, how-to, or explainer aimed at a human reader (developer or end
  user), where structure and clarity carry the value.
- You have a working feature or behavior and need to teach someone to use or extend it.
- Re-organizing existing docs that are technically correct but structured around internals.
- Drafting in-voice prose that a human reviewer will polish (voice is a human-pass concern per
  ../../CLAUDE.md — draft it well, do not claim it final).

## When NOT to Use

- The output is a per-procedure API reference derived from tRPC routers and Zod input/output
  schemas → use `api-docs-from-trpc`, which owns code-derived reference generation.
- The output is the repository README / first-run getting-started doc → use `readme-author`,
  which owns the project landing page and install/run path.
- The "doc" is actually an architecture decision being made → write the prose here, but record
  the decision in `DECISIONS.md`.
- The artifact is an ADR, runbook, or spec with a fixed template → those have dedicated skills.

## Procedure

1. **Name the reader and the task before writing a line (interrogation: high).** One primary
   audience (their existing knowledge) and the one task they finish by the end. Docs fail at the
   root when "everyone" is the audience and "understand the system" is the goal. See
   `references/structure-guide.md` for the audience/task framing.
2. **Pick the document type and its shape.** Tutorial, how-to, concept, or reference each have a
   different spine (learning vs. doing vs. understanding vs. looking-up). Mixing them in one doc
   is the second most common defect. See `references/structure-guide.md` for the four shapes.
3. **Lead with the why, then the how.** Open with the problem the reader has and what success
   looks like, before any steps. A reader who does not know why they are following steps cannot
   recover when a step does not match their situation. See `references/structure-guide.md`.
4. **Write examples that run against this stack (interrogation: high).** Every code sample is
   real, copy-pasteable, and consistent with the spine in ../../CLAUDE.md — App Router, Drizzle
   inference as the type root, `protectedProcedure` with ownership (Rule 2), shared Zod schemas
   (Rule 8), tokens not hex (Rule 3). No `any`, no invented APIs. See `references/examples-that-run.md`.
5. **Match the product voice; never leak secrets or internals that should stay internal.** Draft
   in the product's voice for a human to review. Do not put real keys, tokens, or `NEXT_PUBLIC_`
   misuse in samples (Rule 9); use obvious placeholders. See `references/examples-that-run.md`.
6. **Structure for scanning and recovery.** Task-shaped headings, one idea per paragraph, a
   prerequisites block, and a "if this fails" / troubleshooting path. Readers scan, then read;
   a wall of prose hides the one line they need. See `references/structure-guide.md`.
7. **Verify the doc against the running feature.** Walk every step and run every example exactly
   as written, from a clean state. A doc that drifts from the code is worse than no doc. Note
   any version-perishable claim so `perishable-refresh` can re-check it later.

## Composes With

- **Feeds:** `readme-author` (concept/overview prose this skill drafts is summarized into the
  README) and `api-docs-from-trpc` (this skill's conceptual guides link out to the generated
  reference instead of duplicating it).
- **Pairs with:** `literature-synthesis` when the doc must distill prior sources, and
  `a11y-gate` when the docs site itself ships as rendered UI that must meet WCAG 2.2 AA.
- **Hands off:** decisions surfaced while writing to `DECISIONS.md`; perishable version claims
  to `perishable-refresh`.

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project
> conventions). The encoded failure class was confirmed.

**Observed run.** Asked to document the project-sharing feature, the naive agent produced a
plausible-looking page that fused an end-user UI walkthrough and a developer tRPC reference
into one doc with no audience header, led with a thin "what it does" paragraph instead of the
motivating problem, and — most damaging — fabricated every code example without reading the
actual router or schema: invented procedure names, an unverified import path, made-up ID
formats, and a guessed return shape, plus assumed facts (a 50-member cap, instant revocation)
sourced from nothing.

```ts
const share = api.projectShare.add.useMutation({ /* invented router + path */ });
share.mutate({ projectId: "proj_123", email: "teammate@example.com", role: "editor" });
// members: { userId, email, role, addedAt }[]  ← guessed shape, never read from code
```

**Failure class (confirmed).** Without this skill, docs are written from imagination rather
than from the codebase: audience goes unstated and reader types get blended, the why is
buried under a feature blurb, and "illustrative" examples ship as fabricated, non-runnable
code that can teach Rule 2 (ownership) and Rule 9 (secrets) violations by example. House
style — the audience split, required section structure, and `references/` separation — is
ignored entirely because no project file was consulted.

## Examples

- **Input:** "Document how to add a new tRPC procedure to an existing router." → **Output:** A
  how-to for a developer who already has the app running: opens with why (where business logic
  vs. the thin procedure live, per ../../CLAUDE.md), a prerequisites block, numbered steps, and
  a runnable example showing `protectedProcedure` with the ownership check (Rule 2) and a shared
  Zod input (Rule 8) — plus a troubleshooting note for the common "type not inferred" error.

- **Input:** "Explain our money handling to new contributors." → **Output:** A concept doc, not
  a how-to: why money is integer minor units never a float (Rule 5), the mental model, one
  worked example of formatting cents at the display edge, and a link to the schema reference
  rather than re-documenting columns. No step list, because the reader's task is to *understand*.

- **Input:** "Write the docs for the whole dashboard" → reframed: too broad. Split by reader
  task (viewing metrics vs. configuring alerts vs. exporting), pick the highest-value task
  first, and name its audience before drafting.

## Edge Cases

- **The feature is not finished or still changing** → document the stable contract only, mark
  unstable parts explicitly, and do not write a tutorial against a moving target.
- **The reader needs API specifics mid-guide** → link out to `api-docs-from-trpc` output; do not
  hand-copy signatures that will drift from the generated reference.
- **The example would need a real secret to run** → use a clearly fake placeholder and a one-line
  note on where the real value comes from server-side (Rule 9); never paste a working key.
- **Voice is unsettled or unspecified** → draft plainly and flag the voice pass for a human;
  per ../../CLAUDE.md voice is deliberately not auto-formalized.

## References

- `references/structure-guide.md` — audience/task framing, the four document types and their
  shapes, the why-before-how opener, and the scan-and-recover layout (headings, prereqs,
  troubleshooting).
- `references/examples-that-run.md` — how to write stack-correct, runnable samples: App
  Router + Drizzle + tRPC + Zod + RHF idioms, the rules examples must not teach by counter-
  example, and the secret/placeholder discipline.

## Scripts

Reserved; empty for now. A link-and-snippet checker — compiling fenced code blocks against the
project's tsconfig and flagging dead cross-links — would justify a script once docs live in-repo.
