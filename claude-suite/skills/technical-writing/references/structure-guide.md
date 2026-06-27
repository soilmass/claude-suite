Purpose: how to structure product docs by audience and task — the four document types, the why-before-how opener, and the scan-and-recover layout.

# Audience and task: the two questions that come before writing

Answer both in one sentence each, at the top of your working notes, before drafting:

- **Reader:** who, specifically, and what do they already know? "A developer who has the repo
  running and has written one tRPC procedure" is usable. "Developers" is not.
- **Task:** the one thing they can do when they finish. "Add a paginated list to an existing
  page" is a task. "Understand the data layer" is a goal, not a task — that signals a *concept*
  doc, not a how-to.

If you cannot name one primary reader and one task, the doc is too broad. Split it and pick the
highest-value slice first. "Everyone / understand the system" is the root cause of system-shaped
docs.

# The four document types (Diátaxis-style) — do not mix them

Each type serves a different reader need and has a different spine. One page should be one type;
fusing them is the second most common docs defect.

| Type | Reader need | Spine | Voice |
|------|-------------|-------|-------|
| **Tutorial** | learning by doing, first time | a guaranteed-to-work lesson, start to finish | encouraging, concrete |
| **How-to** | doing a specific task they already understand | numbered steps toward one goal | direct, imperative |
| **Concept / explanation** | understanding why, the mental model | discussion, tradeoffs, no steps | reflective |
| **Reference** | looking up exact facts | exhaustive, consistent, structured | dry, complete |

Reference for this stack is generated — hand it to `api-docs-from-trpc`, do not hand-write it
here. This skill owns the other three.

Tells you mixed types: a "tutorial" with a tradeoffs digression (concept leaking in); a
"concept" doc with copy-paste steps (how-to leaking in). Extract the intruder into its own doc
and cross-link.

# Lead with the why, then the how

Open every doc with the reader's problem and the success state, before any steps:

1. **The problem** the reader has ("you need X but Y").
2. **What success looks like** ("by the end you will have a working Z").
3. **Prerequisites** — explicit, checkable ("the app runs locally; you have a Clerk dev key").
4. Then, and only then, the steps or the explanation.

A reader who does not know *why* a step exists cannot recover when their situation differs from
yours. The why is what lets them adapt. Burying it under step 1 is the most common single defect.

# Scan-and-recover layout

Readers scan first, then read the one section they need. Structure for that:

- **Task-shaped headings** ("Send the invoice", not "The `sendInvoice` mutation"). The heading
  names what the reader does, not what the code is called.
- **One idea per paragraph.** A paragraph doing two jobs hides both.
- **A prerequisites block** up top, as a checklist.
- **A troubleshooting / "if this fails" path** at the end of any how-to or tutorial — the two or
  three ways the steps go wrong and how to tell. Docs without a recovery path strand the reader
  at the first mismatch.
- **Cross-links, not duplication.** Link to the concept doc or generated reference; copied facts
  drift.

# Length and pruning

Shorter is better only if the reader can still finish the task. Cut: restating the obvious,
narrating the UI ("click the blue button"), and apologizing. Keep: the why, the prerequisites,
the failure modes. When a doc grows past one reader-task, split it.
