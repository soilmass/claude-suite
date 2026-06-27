---
name: search
description: >
  Add real search to a table on the edge Postgres stack — both lexical and semantic — without
  reaching for `ILIKE '%q%'` or a Node search engine. Covers Postgres full-text search (a
  generated `tsvector` column, a GIN index, `websearch_to_tsquery`, `ts_rank` ranking) with
  `pg_trgm` for typo-tolerance, and pgvector semantic search (an `embedding` column, an
  ivfflat/hnsw index, cosine distance `<=>`, the embed-at-write + embed-the-query flow), plus
  when to use which and how to fuse them into hybrid search. All expressed through Drizzle `sql`
  operators over the edge HTTP driver, with every result scoped by ownership (Rule 2) and no
  per-row embedding (Rule 7).
  Use when: "add search", "full-text search", "search a table", "fuzzy / typo-tolerant search",
  "vector / semantic search", "pgvector", "hybrid search".
  Do NOT use for: designing the base table being searched (use schema-design), choosing
  non-search indexes for ordinary filters/sorts (use index-strategy), or paging a plain
  unranked list (use pagination-cursor). The full RAG retrieval+generation pipeline (chunking,
  re-ranking, prompt assembly, the LLM call) is out of scope — this skill stops at the query
  that returns ranked rows.
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the search failure class on edge Postgres: `LIKE`/`ILIKE
    '%q%'` passed off as search (unindexable scan, no ranking, no typo tolerance), a tsvector or
    embedding column shipped with no GIN/ivfflat/hnsw index, vector search with no index, and
    results returned without an ownership/tenant predicate. Baseline observed (clean-room
    capture).
---

# search

The skill for adding search over a table on the decided edge stack — full-text, semantic, or
hybrid — using Postgres primitives (`tsvector`/`tsquery`, `pg_trgm`, pgvector) through Drizzle
`sql` operators over the serverless HTTP driver. It exists because "add search" almost always
ships as `ILIKE '%q%'`: it compiles, returns rows on a seed, and then sequentially scans every
row in production with no ranking and no typo tolerance — and because a `tsvector` or
`embedding` column added without its index scans just as badly while looking indexed.

The spine and the nine inviolable rules live in `../../../CLAUDE.md`. This skill leans hardest
on Rule 2 (search results are scoped to the owner/tenant — ranking is not authorization),
Rule 7 (embed at write and embed the query once; never per-row in a loop), and Rule 8 (the
query string is Zod-parsed before it touches `to_tsquery`). It composes the base table from
`schema-design` and the edge driver constraints from `neon-turso-driver`.

---

## Non-Negotiable Rules

A `LIKE` search and an unindexed search column both type-check and demo fine, so these are
hard lines:

- **Never pass `LIKE`/`ILIKE '%q%'` off as search.** A leading-wildcard pattern can't use a
  btree index — it sequentially scans every row, ranks nothing, and misses every typo. Use a
  `tsvector` + GIN (lexical) or pgvector (semantic), never a wildcard scan.
- **Never create a `tsvector` or `embedding` column without its index.** A `tsvector` needs a
  **GIN** index; an `embedding vector` needs an **ivfflat** or **hnsw** index. Without it the
  search scans and re-ranks every row — the column looks indexed and behaves like a `LIKE`.
- **Never return search results unscoped.** The full-text or vector predicate is ANDed with
  the ownership/tenant filter (`eq(table.userId, ctx.auth.userId)`, Rule 2). A relevance
  ranking that crosses tenants is a data leak, not a feature.
- **Never embed inside a loop over rows, and never run a long-lived search engine at the
  edge.** Embed each row once at write time and embed the query string once per request
  (Rule 7); no Node-only Elasticsearch/Meilisearch process and no persistent connection on the
  edge HTTP driver.

Refuse these rationalizations: "`ILIKE '%q%'` is fine for now"; "I'll add the GIN index once
it's slow"; "the table is small, vector search doesn't need an index"; "search already filters,
the ownership check is redundant"; "just embed each candidate row on the fly."

---

## When to Use

- Adding text search over a table's content (title, body, name) with relevance ranking and
  typo / fuzzy tolerance.
- Adding semantic / similarity search ("find posts like this one", "search by meaning") via
  embeddings and vector distance.
- Combining lexical and semantic into one hybrid ranking, and paging the ranked results.
- Deciding whether a given search need is lexical, semantic, or both.

## When NOT to Use

- Designing the table being searched (its columns, relations, base indexes) → `schema-design`.
- Choosing ordinary (non-search) indexes for filters and sorts → `index-strategy` (this skill
  owns only the GIN / ivfflat / hnsw search indexes).
- Paging a plain, unranked list → `pagination-cursor` (this skill *pairs* with it to keyset
  over a ranked result, but doesn't own generic pagination).
- The full RAG pipeline beyond the vector query — chunking, re-ranking, prompt assembly, the
  generation call → out of scope. This skill produces the ranked rows; what you do with them
  for retrieval-augmented generation is a separate concern (note it; don't inline it here).
- Adding a money/time column on the searched table → `money-modeling` / `temporal-data`.

---

## Procedure

1. **Classify the search need first — lexical, semantic, or hybrid (high-interrogation).**
   Exact words / names / codes and "must contain this term" → full-text (lexical). "Find things
   that *mean* the same" / cross-wording recall → vector (semantic). A user-facing search box
   that must catch both keywords and concepts → hybrid. Getting this wrong wastes an index and
   an embedding bill. See `references/hybrid-and-choosing.md`.

2. **Full-text: add a generated `tsvector` column and a GIN index.** Author a `GENERATED ALWAYS
   AS (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,''))) STORED` column
   in the Drizzle schema, then a **GIN** index on it. Generated means it can never drift from
   the source columns; GIN means the search seeks instead of scans. See
   `references/full-text-search.md`.

3. **Query full-text with `websearch_to_tsquery` and rank with `ts_rank`.** Use
   `websearch_to_tsquery` (it parses user input — quotes, `or`, `-` — safely) over raw
   `to_tsquery`, match with the `@@` operator via Drizzle `sql`, and `orderBy` `ts_rank` /
   `ts_rank_cd`. Add `pg_trgm` (`similarity()` / `%`, a GIN/GiST trigram index) for
   typo-tolerant and prefix matching the lexer can't do. See `references/full-text-search.md`.

4. **Semantic: add an `embedding vector(N)` column and an ivfflat/hnsw index, embedded at
   write.** Enable the `vector` extension, add a fixed-dimension `vector(N)` column (N = the
   model's dimension — record the model and N in `DECISIONS.md`), and an **hnsw** (or ivfflat)
   index for the distance op you'll query with. Populate the embedding in the same mutation
   that writes the row — never lazily per read (Rule 7). See `references/semantic-vector-search.md`.

5. **Query semantic with one query embedding and cosine distance `<=>`.** Embed the query
   string *once* per request, pass the vector as a parameter, and `orderBy(sql\`embedding <=>
   ${queryVec}\`)` with a `LIMIT` so the index does the work. Match the operator to the index
   opclass (`<=>` cosine, `<->` L2, `<#>` inner product). See `references/semantic-vector-search.md`.

6. **Scope every result by ownership / tenant (Rule 2).** AND the search predicate with the
   owner/tenant filter in the same `where` — `and(searchPredicate, eq(t.userId, ctx.auth.userId))`
   — so the index narrows to rows the caller may see *before* ranking. For org-scoped data this
   is `multitenancy-scoping`'s `eq(t.orgId, ctx.orgId)`. See `references/semantic-vector-search.md`.

7. **For hybrid, fuse the two rankings and keyset-paginate the result.** Run the lexical and
   vector queries (each scoped), combine with Reciprocal Rank Fusion or a weighted score, and
   page the fused ranking with keyset cursors via `pagination-cursor` — not `LIMIT/OFFSET`. See
   `references/hybrid-and-choosing.md`.

8. **Validate the query input and keep it one round trip (Rules 8, 7).** Zod-parse the search
   string at the tRPC boundary (non-empty, length-capped) before it reaches `to_tsquery` or the
   embedder, and push the filter + rank + `LIMIT` into one SQL statement — never fetch
   candidates then rank or embed them row-by-row in JS. See `references/full-text-search.md`.

---

## Composes With

- **Consumes:** `schema-design` — it defines the base table (columns, relations, FK/base
  indexes); this skill adds only the search column (`tsvector`/`embedding`) and its search index
  on top. `neon-turso-driver` — the edge HTTP driver these `sql` operators run over.
- **Pairs with:** `pagination-cursor` — keyset over the ranked/fused result so deep result
  pages stay correct and cheap; `drizzle-relational-queries` — to load each hit's related rows
  in one round trip instead of per-result (Rule 7); `multitenancy-scoping` — supplies the
  `org_id` predicate that scopes results when the data is tenant-owned.
- **Hands off:** the generic (non-search) index set → `index-strategy`; adding a search column
  to a *populated* table (backfill the `tsvector`/embeddings across deploys, build the index
  with `CONCURRENTLY`) → `migration-author`; everything past the ranked rows in a
  retrieval-augmented-generation flow → out of scope (a separate RAG concern).

---

## Baseline failure (observed 2026-06-27)

> Captured by running the task without this skill (a general-purpose agent told to implement as
> a typical dev would, no project conventions): "add full-text + typo-tolerant search over a
> `posts` table, and semantic search, on Next.js + Drizzle + serverless Postgres." The imagined
> catastrophe (`ILIKE '%q%'`, no index) did NOT occur — a capable base model is better than
> that. A **narrower** failure class was confirmed.

**Observed run.** The agent produced mechanically sound search: a Drizzle `customType` `tsvector`
column **generated** from weighted `title`/`body`, a **GIN** index on it, `pg_trgm` trigram
indexes, `websearch_to_tsquery` + `ts_rank_cd`, a `vector(1536)` column embedded **at write**
with an **hnsw** `vector_cosine_ops` index, and cosine `<=>` queried with the query embedded
**once**. The hard parts were right. But the disciplines this skill exists to enforce were
absent:

```ts
// searchPosts(query, limit) and semanticSearchPosts(query, limit) — plain db helpers,
// no ctx, no auth. Neither filters by the userId column that exists on the table:
.from(posts).where(sql`${posts.searchVector} @@ ${tsQuery} OR ${trgmScore} > 0.15`)
// query string flows straight into websearch_to_tsquery and the embedder — no Zod parse.
generatedAlwaysAs((): any => sql`setweight(...)`)   // and fromDriver: JSON.parse(value)
```

The two search functions return rows **across all users** — there is a `userId` column and it
is never used in a `where` (Rule 2, the #1 vulnerability class); the raw `query` reaches
`websearch_to_tsquery` and the OpenAI embedder with **no validation** (Rule 8); and the type
chain is broken in two places — `(): any` on the generated column and a `JSON.parse` in the
vector `fromDriver` (Rule 1). They are also plain `db` functions outside tRPC, so there is no
`ctx.auth` to scope by in the first place.

**Failure class (confirmed, narrowed).** Not "ships `ILIKE` garbage" — "ships correct FTS +
pgvector mechanics and then leaves off the rigor." The base model gets the generated `tsvector`,
the GIN/hnsw indexes, `websearch_to_tsquery`, embed-at-write, and cosine distance right, then
returns results **unscoped by owner/tenant** (Rule 2), passes the **unvalidated** query into the
tsquery/embedder (Rule 8), and **breaks the type chain** with `any` + untyped `JSON.parse`
(Rule 1). This skill adds the missing discipline: the ownership predicate ANDed into every
search, the Zod boundary on the query string, and the inferred types over the search columns.

---

## Examples

**Input:** "Add typo-tolerant search over `posts` (title + body) for the logged-in user."
**Output:** A generated `searchVector` (`to_tsvector('english', title || ' ' || body)`,
`STORED`) + a GIN index on it; the query matches with
`sql\`${posts.searchVector} @@ websearch_to_tsquery('english', ${q})\``, orders by
`ts_rank(searchVector, websearch_to_tsquery(...))`, and ANDs `eq(posts.userId,
ctx.auth.userId)`. A `pg_trgm` trigram index on `title` backs a `similarity(title, ${q}) > 0.3`
fallback so "databse" still finds "database". The `q` string is Zod-parsed (1–200 chars) first.

**Input:** "Find posts that mean the same thing as a search phrase."
**Output:** An `embedding vector(1536)` column populated in the create/update mutation (embed
`title || body` once), an **hnsw** index `USING hnsw (embedding vector_cosine_ops)`; at query
time embed the phrase once → `orderBy(sql\`${posts.embedding} <=> ${queryVec}\`).limit(20)`,
scoped by owner. The embedding model + dimension are recorded in `DECISIONS.md`.

**Input:** "A search box that should match exact keywords *and* related concepts."
**Output:** Hybrid — run the scoped full-text query and the scoped vector query, fuse with
Reciprocal Rank Fusion (`1/(k+rank)` summed per row), and keyset-paginate the fused ordering
via `pagination-cursor`. Lexical guarantees the exact-term hits; vector adds the conceptual
recall; the fusion is the single ranked list the UI renders (all four states).

---

## Edge Cases

- **The edge driver is Turso/libSQL, not Postgres** → no `tsvector`/pgvector; use SQLite FTS5
  and a vector extension (e.g. `sqlite-vss`) or move that table to a Postgres-class driver.
  Either way it's a fork — record it in `DECISIONS.md` (`neon-turso-driver`).
- **Content is multi-language** → pick the `regconfig` per row's language (store a `language`
  column) or use the `'simple'` config when you can't; `pg_trgm` is language-agnostic and helps
  where the stemmer doesn't. Don't hardcode `'english'` for non-English bodies.
- **The embedding model or its dimension changes** → a `vector(N)` column's `N` is fixed;
  re-embed every row behind expand-contract (add the new column, backfill, switch, drop old)
  via `migration-author`. Never silently truncate or pad vectors.
- **Adding search to a large, already-populated table** → don't inline the column + index;
  hand to `migration-author` to backfill the `tsvector`/embeddings and build the GIN/hnsw index
  with `CONCURRENTLY` so the build doesn't lock writes.
- **ivfflat on a tiny or cold table underperforms** → ivfflat needs enough rows (and a tuned
  `lists`) to beat a seq scan and must be built *after* data loads; prefer **hnsw** (no
  training step) for small or write-heavy tables, at higher build memory.

---

## References

- `references/full-text-search.md` — the Postgres FTS path: the generated `tsvector` column and
  GIN index in Drizzle, `websearch_to_tsquery` vs `plainto_`/`to_tsquery`, the `@@` match and
  `ts_rank`/`ts_rank_cd` ranking, `pg_trgm` trigram fuzzy/prefix matching, and the Zod-validated
  query boundary — all as Drizzle `sql` operators.
- `references/semantic-vector-search.md` — the pgvector path: the `vector` extension and
  fixed-dimension column, ivfflat vs hnsw and the distance operators (`<=>`/`<->`/`<#>`), the
  embed-at-write + embed-the-query-once flow, ownership scoping of vector results, and the edge
  HTTP-driver constraints.
- `references/hybrid-and-choosing.md` — the decision (lexical vs semantic vs hybrid), Reciprocal
  Rank Fusion and weighted score fusion, keyset pagination over a ranked result, and the cost /
  latency trade-offs of each mode.

## Scripts

`scripts/` is reserved (`.gitkeep`). A signal that would justify one: a static check that greps
`src/db/schema/` for a `tsvector`/`vector` column with no matching GIN/ivfflat/hnsw index, or
for `ilike('%...%')` in a procedure named like a search — mechanically enforceable, unlike the
lexical-vs-semantic and fusion judgment that is the core of this skill. Not worth the
maintenance until a second search slice exists to generalize from.
