Purpose: the claim-vs-evidence tagging scheme, citation format, and the evidence-grading rubric that weights sources rather than counting them.

# Claim, evidence, and grading

## Claim vs evidence — the distinction

The single most important move in this skill. They are different objects and must never be
fused into one unattributed sentence.

- **Claim** — what a source *asserts* is true. "Edge cold starts are negligible."
- **Evidence** — what a source *shows*: a measurement, dataset, experiment, or worked proof.
  "Measured p95 cold start = 38ms over 10k invocations on runtime v2."

Tag every extracted note as one or the other. Also record the **evidence relationship**:

- **First-party evidence** — the source itself produced the data.
- **Cited evidence** — the source points to someone else's data (follow the citation; the
  real source is the one to credit and grade).
- **Unsupported claim** — an assertion with no evidence anywhere in the corpus. Record it as
  such; never let it graduate into a finding.

The failure this prevents: a claim from one source and a number from another get welded into
"X is true because the data shows Y," when no single source connected them.

## Citation format

- Source ID always: `[S3]`.
- Anchor when available: `[S3 §4.2]`, `[S3 p.11]`, `[S3 fig.2]`, `[S3 table 1]`.
- Direct quote: verbatim, in quotation marks, with the anchor — `"…" [S3 §4.2]`.
- Paraphrase: your words, marked `(paraphrase)`, still anchored.
- Every line that makes an assertion carries at least one `[S#]`. An uncited assertion is a
  defect.

## Evidence-grading rubric

Weight sources; do not count them. Grade each finding's confidence on four axes:

1. **Type** (strongest → weakest): replicated empirical study > single empirical study >
   reproducible benchmark > formal argument > expert opinion > anecdote > marketing claim.
2. **Recency.** Is it current for a perishable topic? A 2021 benchmark of a runtime now on v4
   is stale — flag it. (Perishability mirrors the maintenance discipline in ../../CLAUDE.md;
   dated facts decay.)
3. **Sample / scope.** n=10000 across conditions beats n=3 on one machine. Does the scope
   actually cover the question, or a narrower case?
4. **Independence.** Three articles citing one origin study are **one** data point, not three.
   Collapse reposts to their origin and weight once. Vendor sources on their own product are
   not independent — note the conflict of interest.

Resulting confidence:

- **High** — strong type, recent, adequate sample, independent corroboration.
- **Medium** — solid but single-sourced, or slightly dated, or narrow scope.
- **Low** — opinion/anecdote, stale, tiny sample, or conflicted source.

State the *why* next to every confidence grade so the reader can challenge it.

## Handling contradictions

When sources disagree:

1. Confirm they answer the *same* question under the *same* conditions (often they do not —
   different versions, workloads, or definitions dissolve the apparent conflict).
2. If genuinely conflicting, present both with their grades.
3. Name the better-supported side and the reason — do not flatten to a neutral sentence, and
   do not silently pick a winner. The contradiction itself is a finding worth surfacing.
