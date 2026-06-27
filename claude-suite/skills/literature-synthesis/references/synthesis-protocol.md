Purpose: the end-to-end protocol for turning a fixed corpus into cited, structured notes — corpus setup, themed-synthesis layout, and the mandatory "not established" boundary.

# Synthesis protocol

## 1. Define the corpus and the question

Before reading deeply, lock two things:

- **The question.** One sentence the synthesis answers. "What do these sources establish about
  X, and where do they disagree?" If you cannot write it, you do not yet have a synthesis task
  — you have a pile of documents.
- **The corpus table.** Every source gets a stable short ID used everywhere downstream.

| ID  | Title / source        | Type             | Date    | Origin / independence note          |
| --- | --------------------- | ---------------- | ------- | ----------------------------------- |
| S1  | Smith et al., "…"     | peer-reviewed    | 2025-03 | primary study                       |
| S2  | Vendor engineering blog | vendor opinion | 2021-08 | cites S1; not independent           |
| S3  | Internal RFC #42      | internal design  | 2026-01 | our own prior decision              |

The corpus is **fixed**. If you find you need a source that is not in it, that is a gap to
flag (and a possible hand-off to `deep-research`), not a license to pull from memory.

## 2. Read each source on its own terms

One pass per source, before any cross-source work. Capture, per source:

- **Central claim** — what it is fundamentally asserting.
- **Evidence type** — empirical study, benchmark, formal argument, anecdote, opinion. (See
  `claim-evidence.md` for the taxonomy and how it grades.)
- **Scope and conditions** — what population/workload/version it actually covers.
- **Date and context** — when, and whether the world has moved since.

Do not synthesize while reading. Merging sources before each is understood on its own is how
attribution gets lost and how one loud source colors the reading of the others.

## 3. Extract notes — atomic, tagged, cited

Each note is one assertion, tagged claim-or-evidence (per `claim-evidence.md`) and carrying a
citation. Format:

```
[S1 §4.2] (evidence) Cold start p95 measured at 38ms across 10k invocations on runtime v2.
[S2]      (claim)    Asserts edge cold starts are "effectively zero" — no measurement given.
```

A direct quote is verbatim inside quotation marks. A paraphrase is your words, marked as a
paraphrase, still cited. An uncited note does not enter the synthesis.

## 4. Cluster by theme and map the landscape

Group notes under sub-questions of the main question. Within each cluster, mark the shape of
agreement:

- **Convergence** — multiple independent sources agree (and how strongly).
- **Divergence** — sources conflict; name them and route to the contradictions block.
- **Singleton** — only one source speaks; flag the thin coverage.

## 5. Output structure

```
# Synthesis: <question>

## Sources
<the corpus table from step 1>

## Findings by theme
### Theme A
- Finding: <statement>
  - Claim/Evidence: <claim → the evidence that backs it>
  - Sources: [S1 §4.2], [S3]
  - Confidence: high | medium | low — <why, per the grading rubric>

### Theme B
…

## Contradictions
- [S2] vs [S1] on cold-start cost: S1 measures 38ms p95; S2 asserts ~0 with no data.
  Better-supported: S1 (empirical, recent, independent). See claim-evidence grading.

## Gaps & open questions
- No source covers workloads above 1k req/s.

## What the sources do NOT establish
- They do not show X. They do not address Y. (This section is mandatory — it is the main
  guard against the reader assuming more was proven than was.)

## Synthesizer's inference (clearly separated)
- My own read, beyond what any source states: … (kept visibly distinct from cited findings.)
```

The last two sections are non-optional. The "NOT established" boundary stops the reader from
treating gaps as settled; the inference section keeps your conclusions from masquerading as
the sources' findings.
