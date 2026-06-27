Purpose: the decision (lexical vs semantic vs hybrid), how to fuse two rankings (Reciprocal
Rank Fusion / weighted score), keyset pagination over a ranked result, and the cost/latency
trade-offs of each mode.

# Choosing the search mode, and hybrid fusion

## 1. Lexical vs semantic vs hybrid

Pick from what the user *means* by a match, not from what's newest:

| Need | Mode | Why |
|------|------|-----|
| Exact terms, names, codes, SKUs, "must contain X", phrases, negation | **Full-text** | Lexemes match precisely; cheap; no embedding bill; ranks by term frequency/proximity. |
| "Find things that *mean* the same", cross-wording, conceptual recall, "more like this" | **Vector** | Embeddings capture meaning; catches synonyms/paraphrase full-text misses. |
| A general user-facing search box that must catch both keywords *and* concepts | **Hybrid** | Lexical guarantees the exact-term hits; vector adds conceptual recall; fusion gives one ranking. |

Decision aids:

- If the corpus is short, structured strings (tags, titles, identifiers) → lexical alone, with
  `pg_trgm` for typos. Embeddings add cost and latency for little gain.
- If users describe what they want in their own words and expect "good enough" matches → vector,
  or hybrid.
- Default a real product search box to **hybrid** once both columns exist; it strictly dominates
  either alone on recall, at the cost of two queries + one embedding call.

Record a non-obvious choice (and why you did *not* add vectors, if asked) in `DECISIONS.md`.

## 2. Hybrid fusion: combine two scored lists

Lexical `ts_rank` and vector cosine distance are on **incomparable scales**, so you cannot add
them directly. Two robust approaches:

**Reciprocal Rank Fusion (RRF)** — rank-based, scale-free, the safe default. Take each list's
*position* (1st, 2nd, …) and sum `1 / (k + rank)` per row across lists (k ≈ 60). A row near the
top of either list scores well; a row near the top of both wins.

```ts
function rrf(lexical: Row[], semantic: Row[], k = 60) {
  const score = new Map<string, number>();
  lexical.forEach((r, i) => score.set(r.id, (score.get(r.id) ?? 0) + 1 / (k + i + 1)));
  semantic.forEach((r, i) => score.set(r.id, (score.get(r.id) ?? 0) + 1 / (k + i + 1)));
  return [...score.entries()].sort((a, b) => b[1] - a[1]);   // [id, fusedScore][]
}
```

Run each side as its **own scoped, indexed, LIMITed** query (each with `eq(userId, …)`), fetch
the top ~50 from each, then fuse. This can also be done in one SQL statement with two CTEs and a
full join on id — keep it one round trip (Rule 7).

**Weighted score fusion** — normalize each score to 0..1 (min-max over the page) then
`α·lexical + (1-α)·semantic`. More tunable, but sensitive to normalization and outliers; prefer
RRF unless you have data to tune α.

## 3. Paginating a ranked result (pairs with pagination-cursor)

A ranked search result still needs paging, and `LIMIT/OFFSET` over a ranking degrades and
double-shows rows as data mutates. Use **keyset (cursor) pagination** (`pagination-cursor`) with
the rank/score as the sort key and a stable tie-breaker (the row id):

- Cursor = `(lastScore, lastId)`; the next page is `where (score, id) < (lastScore, lastId)`.
- For **fused** hybrid results the score isn't a column — either materialize the fused score and
  page over it, or cap search at a bounded top-N (e.g. top 100) and page within that window
  (search relevance past ~100 results is rarely meaningful).
- Keep the ownership predicate in every page (Rule 2) — paging never widens scope.

## 4. Cost / latency trade-offs

- **Full-text:** one SQL query, no external call. Cheapest and lowest latency. Index build is
  fast. Scales to large corpora on a GIN index.
- **Vector:** one embedding API call (network + spend) per query *and* per write, plus an ANN
  index that costs memory (hnsw) or tuning (ivfflat). Latency floor = the embedding call.
- **Hybrid:** two queries + one embedding call + fusion. Highest cost/latency; best recall.
  Reserve for the primary search surface, not every internal filter.

Honor the edge time budget and the `spend-cap` — embeddings are a per-request external cost, so
debounce/skip re-embeds on unchanged text and cache query embeddings for repeated searches.
