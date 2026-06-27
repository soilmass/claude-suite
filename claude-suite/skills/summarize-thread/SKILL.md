---
name: summarize-thread
description: >
  Compress a long GitHub issue, pull request, or discussion thread into a structured digest:
  decisions actually made (with who/when), open questions still unresolved, and concrete action
  items with owners. It exists to stop the summarization failure where a thread gets flattened
  into a chronological "they said, then they said" recap that buries what was decided, loses
  who owns what, and silently drops the disagreements that were never resolved. Reads the thread
  faithfully and attributes every claim to a real comment; it never invents consensus.
  Use when: "summarize this thread", "tldr the discussion", "what was decided", "summarize the issue".
  Do NOT use for: logging a formal, durable decision record (use decision-log),
  or writing reader-facing prose docs/guides (use technical-writing).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the chronological-recap failure class: decisions buried under
    a he-said-she-said timeline, action items with no owner, and unresolved forks dropped.
    Baseline observed (clean-room capture).
---

# summarize-thread

Turn a sprawling issue, PR, or discussion into a digest someone can act on without reading the
original. The discipline is one reframe: organize the output by **decision state** — what is
settled, what is open, what someone must do — not by the order comments arrived. This skill
prevents the digest that is just a shorter timeline. It is an analysis-and-writing skill, not a
code skill; it cites no inviolable rules but feeds the artifacts that do (see ../../CLAUDE.md for
where decisions and forks are recorded).

## When to Use

- A long issue/PR/discussion thread needs to be made actionable for someone who was not present.
- You need to know "what was actually decided here" versus what was merely floated and dropped.
- Catching up after time away: a TL;DR that distinguishes settled from still-contested points.
- Prepping a thread for handoff — extracting the action items and their owners before assigning.

## When NOT to Use

- Recording a single, durable, authoritative decision with rationale and alternatives considered
  → use `decision-log` (this skill *surfaces* decisions; `decision-log` *ratifies* one).
- Writing reader-facing documentation, a guide, or an explainer → use `technical-writing`.
- Generating release notes from merged commits → use `release-notes` or `changelog-from-commits`.
- Synthesizing external research sources rather than one project thread → use `literature-synthesis`.

## Procedure

1. **Pull the full thread, not a snippet (interrogation: low).** Get every comment, review, and
   inline code-review remark in order — `gh issue view N --comments` / `gh pr view N --comments`.
   A summary built from a truncated thread will miss the comment that reversed an earlier call.
   See `references/thread-extraction.md` for the `gh` commands and what to capture.
2. **Classify each substantive comment by decision state (interrogation: medium).** Sort content
   into Decided, Open Question, Action Item, or Context/noise. The cost of being wrong here is a
   reader trusting a "decision" that was actually an unanswered proposal — so when a comment is
   ambiguous, classify it Open, never Decided. See `references/digest-structure.md`.
3. **Attribute every decision and action to a person and a moment.** A decision with no owner and
   no "as of when" is a rumor. Record who stated it and link the comment; mark superseded calls as
   superseded rather than deleting them. See `references/digest-structure.md` for the attribution
   format.
4. **Separate settled from contested, explicitly.** Any point where participants disagreed and the
   thread did not converge is an Open Question, even if the loudest voice "won." Never manufacture
   consensus the thread did not reach. This is the single highest-value judgment in the skill.
5. **Make action items concrete and assignable.** Each: a verb, an owner (or "UNASSIGNED"), and the
   trigger/blocker if any. "We should improve perf" is not an action item; "@x adds an index on
   `orders.user_id` before merge" is. See `references/digest-structure.md`.
6. **Emit the digest in the fixed four-block shape.** TL;DR (2-3 sentences) → Decisions → Open
   Questions → Action Items. Keep it skimmable; link back to source comments rather than quoting at
   length. See `references/digest-structure.md` for the exact template.
7. **Hand off, do not overreach.** If a surfaced decision deserves to be ratified durably, hand it
   to `decision-log`; if a fork touches the stack spine, note it belongs in `DECISIONS.md`. Do not
   write the decision record yourself here.

## Composes With

- **Consumes:** raw thread text from `gh` (issues, PRs, discussions) or pasted discussion logs.
- **Hands off:** ratifiable decisions to `decision-log`; spine-level forks to `DECISIONS.md`.
- **Pairs with:** `technical-writing` when a surfaced concept needs a real explainer, and
  `release-notes` when the thread's merged outcomes need a user-facing changelog entry.

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project
> conventions). The encoded failure class was confirmed.

**Observed run.** Asked to summarize edge-stack issue #482 with no thread text actually
supplied, the naive agent did not stop and pull the source — it fabricated an entire
plausible thread (participants alice/bob/carol/dave/erin, PR #489, a flag named
`EDGE_AUTH_ORDER_FIX`) and presented the invented scaffolding as extracted facts. It also
led with a time-ordered "what happened" recap, the exact framing this skill exists to
replace, and attributed everything to bare first-name handles with no permalinks.

```markdown
## What happened (quick recap)
- **alice (OP):** ~2-5% of authenticated tRPC mutations return 401 in prod...
- **bob:** Suspected the serverless DB driver dropping connections; ruled out...
- **dave:** Found a custom middleware doing a header rewrite running *before* `clerkMiddleware`...
```

**Failure class (confirmed).** Without this skill the agent invents consensus and source
material rather than refusing when no real thread is grounded, and it organizes by
chronology instead of by decision state — burying what was decided under a he-said-she-said
timeline with unlinked, first-name-only attribution.

## Examples

- **Input:** "TL;DR this issue about whether to use cursor or offset pagination." → **Output:** A
  TL;DR ("Team is leaning cursor pagination for the feed; not yet ratified — one objection on
  cursor opacity is open"), a Decisions block (empty or "none ratified"), Open Questions ("cursor
  encoding scheme — @a vs @b, unresolved as of comment #34"), and Action Items ("@a posts a cursor
  format proposal — UNASSIGNED deadline"). Hands the eventual choice to `decision-log`.

- **Input:** "What was decided in this PR review?" → **Output:** Decisions block listing each
  resolved review thread with the reviewer who approved it and a link; Open Questions for review
  threads marked unresolved; Action Items for requested changes ("@author adds ownership check to
  `invoice.update` per reviewer comment #12, blocking merge"). Superseded suggestions marked struck.

- **Input:** "Summarize this discussion" (60 comments, two competing designs) → **Output:** TL;DR
  names both designs and states no decision was reached; Open Questions captures the live fork with
  each side's strongest argument attributed; Action Items: "schedule sync to decide — UNASSIGNED."

## Edge Cases

- **The thread reached no decision at all** → say so plainly in the TL;DR; do not invent one. An
  honest "nothing was decided; here are the open forks" is the correct output.
- **A decision belongs in the durable record** → surface it here, then hand to `decision-log`; if it
  changes a spine choice in ../../CLAUDE.md, note it must go to `DECISIONS.md`. Don't ratify it here.
- **Comments contradict each other and order matters** → track supersession explicitly (mark the
  earlier call superseded by the later, with both links); never silently keep only one.
- **The thread is mostly bot/CI noise or off-topic** → filter to substantive human comments; note
  what you filtered so the reader knows the digest is not the literal full thread.

## References

- `references/thread-extraction.md` — the `gh` commands to pull full issue/PR/discussion threads
  with comments and reviews, and what to capture (author, timestamp, permalink, resolved state).
- `references/digest-structure.md` — the four-block output template, the decision-state taxonomy,
  the attribution/supersession format, and what makes an action item assignable.

## Scripts

Reserved; empty for now. A `gh`-driven extractor that emits a normalized comment list (author,
timestamp, permalink, body, resolved-state) as JSON would justify a script once digests are run
across many threads and the manual `gh view` step becomes the bottleneck.
