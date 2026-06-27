Purpose: the pgvector semantic path — the `vector` extension and fixed-dimension column,
ivfflat vs hnsw and the distance operators, the embed-at-write + embed-the-query-once flow,
ownership scoping of vector results, and the edge HTTP-driver constraints.

# Semantic (vector) search on edge Postgres (Drizzle + pgvector)

Semantic search ranks rows by *meaning*, not shared words. Each row's text is turned into an
embedding (a fixed-length float vector) by a model; the query string is embedded the same way;
the closest vectors by distance are the most semantically similar. It catches recall that
full-text misses ("car" ≈ "automobile") but cannot guarantee an exact-term hit — which is why
hybrid (see `hybrid-and-choosing.md`) exists.

## 1. The `vector` extension and a fixed-dimension column

Enable pgvector once, then add a `vector(N)` column where **N is the embedding model's
dimension** (e.g. 1536 for OpenAI `text-embedding-3-small`, 768 for many open models). N is
fixed at column-creation — record the model and N in `DECISIONS.md`, because changing either is
a re-embed migration (`migration-author`), not an edit.

```ts
import { customType } from "drizzle-orm/pg-core";

// Drizzle has no native vector type. Keep both sides typed (no `any`, no untyped JSON.parse).
const vector = (name: string, dimensions: number) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() {
      return `vector(${dimensions})`;
    },
    toDriver(value: number[]): string {
      return `[${value.join(",")}]`;
    },
    fromDriver(value: string): number[] {
      // pgvector returns '[1,2,3]'; parse to a typed number[] without an untyped JSON.parse.
      return value.slice(1, -1).split(",").map(Number);
    },
  })(name);

export const posts = pgTable("posts", {
  // ...title, body, userId...
  embedding: vector("embedding", 1536),   // nullable until backfilled
});
```

`fromDriver`/`toDriver` keep the chain typed as `number[]` (Rule 1) — do not return `any` or
`JSON.parse(value)` untyped at this boundary.

## 2. The index: ivfflat vs hnsw

A `vector` column with **no** index forces an exact full scan + sort on every query — the same
failure as an unindexed `tsvector`. Both pgvector index types are *approximate* nearest-neighbor
(ANN); pick per the distance op you query with:

- **hnsw** (`USING hnsw (embedding vector_cosine_ops)`) — graph index. No training step, so it
  works on an empty/growing table and is the better default for write-heavy or small tables.
  Higher build time and memory, excellent recall.
- **ivfflat** (`USING ivfflat (embedding vector_cosine_ops) WITH (lists = N)`) — partitions
  vectors into `lists` cells. Lighter memory, but must be built **after** data is loaded (it
  trains on the existing rows) and needs `lists` tuned (~`rows/1000`). Building it on
  mostly-NULL/empty data wastes the index.

The opclass must match the operator: `vector_cosine_ops`↔`<=>`, `vector_l2_ops`↔`<->`,
`vector_ip_ops`↔`<#>`. Build the index in a reviewed migration:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE posts ADD COLUMN embedding vector(1536);
CREATE INDEX posts_embedding_idx ON posts USING hnsw (embedding vector_cosine_ops);
```

## 3. Distance operators

- `<=>` **cosine distance** (1 − cosine similarity) — the usual choice for text embeddings;
  scale-invariant. Convert to a 0..1 similarity for the client with `1 - (embedding <=> q)`.
- `<->` **L2 (Euclidean)** distance.
- `<#>` **negative inner product** (returns the negative, so smaller = closer).

Order **ascending** by distance (closest first). The ANN index is only used when the `ORDER BY`
matches its operator/opclass and a `LIMIT` is present.

## 4. Embed at write, embed the query once (Rule 7)

The embedding is computed by an external model call — the expensive, latency-bearing step. Two
hard rules:

- **Embed at write time.** Compute the embedding in the same mutation that creates/updates the
  row and store it. Re-embed only when the source text changed (skip unchanged title+body to
  avoid burning API calls). Never embed a row lazily during a read.
- **Embed the query once per request.** One model call for the query string, then a single SQL
  query orders by distance against the stored vectors. Never embed candidate rows in a loop —
  that is the Rule 7 N+1, multiplied by an API call.

```ts
// bind the query vector as a parameter and cast — never string-concatenate it into the SQL.
function toVectorParam(v: number[]) {
  return sql`${`[${v.join(",")}]`}::vector`;
}

export async function createPost(ctx: Ctx, input: PostInput) {
  const embedding = await embed(`${input.title}\n\n${input.body}`); // one call, at write
  return ctx.db.insert(posts).values({ ...input, userId: ctx.auth.userId, embedding });
}

export async function semanticSearch(ctx: Ctx, q: string, limit = 20) {
  const queryVec = await embed(q);                          // one call, at read
  return ctx.db
    .select({
      id: posts.id,
      title: posts.title,
      similarity: sql<number>`1 - (${posts.embedding} <=> ${toVectorParam(queryVec)})`,
    })
    .from(posts)
    .where(and(
      eq(posts.userId, ctx.auth.userId),                   // Rule 2 — scope before ranking
      sql`${posts.embedding} is not null`,
    ))
    .orderBy(sql`${posts.embedding} <=> ${toVectorParam(queryVec)}`)
    .limit(limit);                                          // LIMIT so the ANN index engages
}
```

Pass the query vector as a bound parameter (`toVectorParam` formats it as the `'[...]'::vector`
literal); never string-concatenate it into the SQL.

## 5. Ownership scoping is not optional (Rule 2)

A vector ranking finds the *globally* nearest rows — across every user — unless you constrain
it. AND the owner/tenant predicate into the `where` (`eq(posts.userId, ctx.auth.userId)`, or
`multitenancy-scoping`'s `eq(posts.orgId, ctx.orgId)`) so the candidate set is filtered to rows
the caller may see before distance is even considered. A relevance ranking that crosses tenants
is a data leak. Note: an ANN index plus a selective filter can under-return (the index walks the
graph, then the filter drops most of its `LIMIT` candidates) — over-fetch (`LIMIT` higher) and
re-trim, or use partitioned/partial indexes for heavily multi-tenant data.

## 6. Edge runtime constraints

- All of this is SQL over the **edge HTTP driver** (`neon-turso-driver`) — no Node-only vector
  store, no long-lived connection, no in-process index.
- The **embedding model call** is a network request; honor the edge time/compute budget and the
  spend cap (`spend-cap`). Cache or debounce re-embeds on update.
- Vectors are large — don't `select *` the embedding back to the client; project only the
  columns the UI needs (the embedding never leaves the server).

## Out of scope (note, don't inline)

The RAG pipeline *beyond* this query — document chunking, a re-ranker model, prompt assembly,
the generation call — is a separate concern. This reference ends at the ranked rows the vector
query returns.
