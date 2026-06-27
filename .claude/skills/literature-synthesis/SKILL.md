---
name: literature-synthesis
description: >
  Synthesize a fixed set of documents — papers, articles, internal docs, RFCs — into
  cited, structured notes that keep claim and evidence visibly separate and attribute every
  assertion to a specific source location. It exists to stop the synthesis failure where
  sources blur into one confident, unattributed voice and the reader can no longer tell what
  was actually shown from what was inferred. Works over sources you already have in hand; it
  does not go find new ones. Honors the documentation discipline in ../../CLAUDE.md.
  Use when: "synthesize these docs", "summarize research", "literature review", "notes from sources".
  Do NOT use for: multi-source web research that fans out and verifies new sources (use deep-research),
  or scanning competitors' products and positioning (use competitive-analysis).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the unattributed-blur failure class: sources merged into one
    voice, claim and evidence conflated, no per-source citation, contradictions silently dropped.
    Baseline section is the encoded failure class; replace with an observed transcript.
---

# literature-synthesis

Turn a known set of documents into notes a reader can trust and trace. The discipline is one
move repeated: every assertion carries a citation to where it came from, and a claim (what a
source argues) is never silently fused with evidence (what a source measured or showed). This
skill prevents the failure where five papers collapse into one smooth, confident paragraph
that no longer attributes anything and quietly buries the places the sources disagree. See
../../CLAUDE.md for the surrounding documentation conventions.

## When to Use

- You have a bounded, in-hand corpus (PDFs, articles, internal docs, transcripts) and want
  structured, cited notes out of it.
- A literature review or related-work section where attribution and accuracy matter.
- Reconciling several documents on one topic — especially when they may disagree.
- Producing notes another person (or a later prompt) will act on and must be able to verify.

## When NOT to Use

- The sources do not exist yet and must be discovered, fetched, and adversarially verified
  across the open web → use `deep-research`, which owns fan-out search and source vetting.
- The goal is to size up competitors' products, pricing, or positioning → use
  `competitive-analysis`, which owns the market-scan frame.
- You only need one document's gist, not a cross-source synthesis → just read it; this skill's
  machinery is overhead for a single source.
- The output is a product/architecture decision, not notes → synthesize here, then record the
  decision in `DECISIONS.md`.

## Procedure

1. **Fix the corpus and the question first (interrogation: medium).** List every source with a
   stable short ID (`[S1]`, `[S2]`…) and state the one question the synthesis answers. An
   undefined corpus or a vague question is the root cause of a synthesis that wanders and
   over-claims. See `references/synthesis-protocol.md`.
2. **Read each source on its own terms before comparing.** Per source, capture its central
   claim, its evidence type (empirical study, benchmark, argument, anecdote, opinion), scope,
   and date. Resist synthesizing while reading — premature merging is how attribution is lost.
3. **Separate claim from evidence as you extract (interrogation: high).** For every note, tag
   it: a *claim* (what the source asserts) or *evidence* (the data/result that backs it), and
   whether the source itself supplies the evidence or merely cites it. Conflating the two is
   the central defect this skill exists to prevent. See `references/claim-evidence.md`.
4. **Cite every assertion to a location.** No note enters the synthesis without `[S#]` and,
   where possible, a section/page/figure anchor. A direct quote is verbatim and quoted; a
   paraphrase is marked as such. An uncited line is a defect, not a stylistic choice.
5. **Cluster by theme, then map agreement and conflict.** Group notes by sub-question. Within
   each cluster, explicitly mark where sources converge, where they diverge, and where only
   one source speaks. Surfacing disagreement is a feature; smoothing it over is the failure.
6. **Grade the evidence, don't just count it.** Weight by evidence type, sample, recency, and
   independence — three blog posts citing one study is one data point, not three. Flag stale
   or low-confidence sources. See `references/claim-evidence.md` for the grading rubric.
7. **Write the structured synthesis with a traceable spine.** Produce the layered output in
   `references/synthesis-protocol.md`: question, source table, per-theme synthesis (claim →
   evidence → confidence), contradictions, gaps, and a "what the sources do NOT establish"
   section. Keep your own inference visibly labeled and separate from what the sources say.

## Composes With

- **Pairs with:** `competitive-analysis` — that skill scans the market, this one digests the
  written sources it (or you) gathered into cited notes.
- **Hands off:** broad, open-web research that needs new sources fetched and verified to
  `deep-research`; this skill takes the corpus deep-research returns and structures it.
- **Feeds:** `tech-evaluation` and `spike-research` when the synthesis informs a tooling or
  feasibility decision, and `DECISIONS.md` when it resolves a fork.

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project
> conventions). The encoded failure class was confirmed.

**Observed run.** Asked to synthesize three HTTP-caching articles (MDN, web.dev, Cloudflare),
the naive agent never fetched them — it reconstructed "what these well-known sources typically
say" from memory and presented the result as a sourced synthesis. Claim and evidence are fused
into flat assertions with no `[S#]` anchors, no quoted lines, no URLs or access dates, and no
recency grading; the reader cannot tell paraphrase from source wording or verify a single line.

```markdown
### Cache-Control directives (from MDN + Cloudflare)
- `max-age=N` — response is fresh for N seconds.
- `no-cache` — store it, but revalidate before every use. (Common gotcha: this does NOT
  mean "don't cache.")
```

(Attributed to "MDN + Cloudflare" with no anchor, no quote, and no source actually read.)

**Failure class (confirmed).** Sources blur into one confident, unattributed voice: assertions
are stated as fact rather than tagged as "source X claims Y" with a quotable, located line, and
nothing distinguishes what was shown from what was inferred or recalled. Without the citation-
to-location and claim/evidence discipline, the synthesis is unauditable and silently substitutes
memory for the corpus.

## Examples

- **Input:** "Synthesize these 4 PDFs on RAG chunking strategies." → **Output:** A source
  table (`[S1]`–`[S4]` with type/date), themed synthesis (fixed-size vs semantic vs
  recursive chunking), each finding as *claim → evidence([S#], §/fig) → confidence*, a
  contradictions block where `[S2]` and `[S4]` disagree on overlap size, and a "NOT
  established" note that none tested the corpus size in question.

- **Input:** "Literature review of these articles on OKLCH vs HSL for design tokens." →
  **Output:** Per-source claims separated from the perceptual-uniformity evidence each
  actually shows; a convergence note (all favor OKLCH for lightness consistency) and a
  divergence note (browser-support caveats differ by article's date); confidence graded down
  for the two opinion pieces. Feeds `design-tokens` if a decision follows.

- **Input:** "Summarize research on this topic" with no documents attached → reframed: this
  skill needs a fixed corpus. Either attach the sources, or hand the open-web discovery to
  `deep-research` first and bring its output back here.

## Edge Cases

- **Sources directly contradict each other** → do not pick a winner silently; present both
  with their evidence grades and state which is better-supported and why, in the
  contradictions block.
- **A claim has no evidence in any source** → record it as an unsupported claim or an open
  gap, never promote it to a finding.
- **The corpus is one source pretending to be many** (reposts citing one origin) → collapse to
  the origin, note the inflation, and weight as a single data point (Rule of independence in
  the grading rubric).
- **A source needs information from outside the corpus to interpret** → flag it as a gap and
  hand the lookup to `deep-research`; do not quietly fill it from memory.

## References

- `references/synthesis-protocol.md` — the end-to-end protocol: corpus table, source IDs,
  themed-synthesis layout, and the mandatory "what the sources do NOT establish" section.
- `references/claim-evidence.md` — the claim-vs-evidence tagging scheme, citation format, and
  the evidence-grading rubric (type, recency, sample, independence).

## Scripts

Reserved; empty for now. A citation-coverage checker — flagging any synthesis line lacking an
`[S#]` anchor — would justify a script once the note format stabilizes.
