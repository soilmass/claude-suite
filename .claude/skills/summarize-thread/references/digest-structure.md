# digest-structure — the output template, decision-state taxonomy, and attribution format

The whole value of this skill is in the shape of the output. Organize by decision state, not by
time. This file is the contract for that shape.

## The decision-state taxonomy

Classify each substantive comment into exactly one bucket. When ambiguous, demote toward Open —
never promote a proposal to a Decision.

| State | Definition | Tell |
| --- | --- | --- |
| **Decided** | A choice was made AND not later reversed; someone with standing stated it. | "We'll go with X", an approval, an accepted answer, a maintainer "merging this". |
| **Open Question** | Raised and not resolved, OR contested with no convergence. | A question with no answer; two participants disagreeing; "we should figure out…". |
| **Action Item** | Concrete work someone must do, with a verb and (ideally) an owner. | "@x will add…", a `CHANGES_REQUESTED` review, "TODO before merge". |
| **Context** | Background, rationale, noise — informs but is not actionable. | Explanations, links, "+1", bot output. Summarized only if load-bearing. |

A proposal that drew no response is an **Open Question** ("proposed, no response"), never Decided.

## The four-block output template

```markdown
## TL;DR
<2-3 sentences. State whether anything was decided. If contested and unresolved, say so here.>

## Decisions
- **<decision>** — decided by @<author> (<date>, <permalink>). <one-line rationale if given>
- ~~<superseded decision>~~ — superseded by the decision above (@<author>, <permalink>).

## Open Questions
- **<question / unresolved fork>** — @<a> argues <X>; @<b> argues <Y>. Unresolved as of <permalink>.
- **<proposal, no response>** — proposed by @<author> (<permalink>), no replies.

## Action Items
- [ ] <verb phrase> — owner: @<login | UNASSIGNED>; blocker: <none | what blocks it> (<permalink>)
```

If a block is empty, write it with "None." — an explicit empty Decisions block is information
(it tells the reader nothing was settled).

## Attribution and supersession

- Every Decision and Action Item names a person (`@login`) and links a comment. No floating claims.
- A Decision reversed by a later comment is marked struck-through and tagged superseded, with both
  links — never delete the earlier one, and never report both as live.
- Use "as of <permalink/date>" for anything that could still change after the digest is written.

## What makes an action item assignable

A good action item is a sentence with a **verb**, an **owner**, and a **trigger/blocker**.

- Bad: "improve performance" — no verb that bottoms out in an act, no owner, no done-condition.
- Good: "[ ] add a covering index on `orders.user_id` — owner: @a; blocker: needs migration via
  migration-author before merge (#comment-link)".

Owner unknown is fine — write `UNASSIGNED` so it is visibly unassigned, not silently ownerless.

## Length discipline

The digest is a tool for not reading the thread; it must be skimmable. Link back to source
comments instead of quoting paragraphs. Aim: a 60-comment thread fits on one screen. If a point
needs the full quote to be understood, link it rather than inlining the whole comment.

## Handoff boundaries

- A Decision worth ratifying durably → hand to `decision-log`; do not write the decision record here.
- A fork touching the stack spine (the decided framework/ORM/auth choices) → note it belongs in
  `DECISIONS.md` per ../../CLAUDE.md.
- Merged outcomes that users should hear about → hand to `release-notes`.
