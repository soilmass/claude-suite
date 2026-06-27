Purpose: the Postgres full-text + trigram path — the generated `tsvector` column and GIN index
in Drizzle, `websearch_to_tsquery` + `ts_rank` ranking, `pg_trgm` fuzzy matching, and the
Zod-validated query boundary, all as Drizzle `sql` operators over the edge HTTP driver.

# Full-text search on edge Postgres (Drizzle)

Postgres full-text search turns text into a normalized `tsvector` of lexemes (stemmed, lowercased,
stop-words dropped) and matches it against a `tsquery`. It is the right tool when the user means
*words* — "must contain `invoice`", phrases, negation — and wants relevance ranking. It runs
entirely in SQL, so it works on the edge HTTP driver with no extra service.

## 1. The generated `tsvector` column (never store it by hand)

Author the search vector as a **generated stored column** so it can never drift from its source
columns and needs no trigger or app code to maintain. Drizzle has no first-class `tsvector` type,
so define one with `customType` and use `.generatedAlwaysAs(...)` with a typed callback (no `any`
— Rule 1):

```ts
import { customType } from "drizzle-orm/pg-core";
import { sql, type SQL } from "drizzle-orm";

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),          // ownership column — used in every search where
    title: text("title").notNull(),
    body: text("body").notNull(),
    // weighted: title is rank 'A' (highest), body 'B'.
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      (): SQL =>
        sql`setweight(to_tsvector('english', coalesce(${posts.title}, '')), 'A') || setweight(to_tsvector('english', coalesce(${posts.body}, '')), 'B')`,
    ),
  },
  (t) => [
    index("posts_user_id_idx").on(t.userId),                 // FK/ownership floor (index-strategy)
    index("posts_search_idx").using("gin", t.searchVector),  // the GIN index — non-negotiable
  ],
);
```

The `coalesce(..., '')` guards NULL columns (concatenating a NULL `tsvector` yields NULL).
`setweight` lets `ts_rank` weight title matches above body matches. Type the
`generatedAlwaysAs` callback as `SQL` — never `(): any`, which severs the type chain.

## 2. The GIN index is the search index

`CREATE INDEX ... USING gin (search_vector)`. Without it, `@@` re-derives and scans every row —
the column *looks* indexed and performs like a `LIKE`. GIN is the default for `tsvector` (it
indexes each lexeme). drizzle-kit may not emit the extension or the exact `USING gin` op reliably;
keep the extension and index in a reviewed migration (see `migration-author`):

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX posts_search_idx ON posts USING gin (search_vector);
```

## 3. Querying: `websearch_to_tsquery`, `@@`, and `ts_rank`

Prefer **`websearch_to_tsquery`** — it parses raw end-user input (quoted `"phrases"`, `or`,
leading `-` to exclude) and never throws on punctuation, unlike `to_tsquery` (which requires
operator syntax and raises on malformed input). Match with `@@`; rank with `ts_rank` (or
`ts_rank_cd`, which weights term proximity). Always AND the ownership predicate (Rule 2):

```ts
import { sql, and, eq, desc } from "drizzle-orm";

export async function searchPosts(ctx: Ctx, q: string, limit = 20) {
  const tsq = sql`websearch_to_tsquery('english', ${q})`;
  return ctx.db
    .select({
      id: posts.id,
      title: posts.title,
      rank: sql<number>`ts_rank_cd(${posts.searchVector}, ${tsq})`.as("rank"),
    })
    .from(posts)
    .where(and(sql`${posts.searchVector} @@ ${tsq}`, eq(posts.userId, ctx.auth.userId)))
    .orderBy(desc(sql`rank`))
    .limit(limit);
}
```

`q` is interpolated as a **parameter** (`${q}`), so there is no SQL injection surface — but it
must still be Zod-parsed at the tRPC boundary (§5).

## 4. `pg_trgm` for typo-tolerance and prefix matching

The FTS lexer matches *lexemes*, so a misspelling ("databse") produces a different lexeme than
"database" and never matches. `pg_trgm` indexes 3-character trigrams and scores raw string
**similarity**, which survives typos and supports prefix/substring matching. Add a trigram GIN
index per column you fuzzy-match and combine it with the FTS predicate:

```sql
CREATE INDEX posts_title_trgm_idx ON posts USING gin (title gin_trgm_ops);
```

```ts
// fall back to fuzzy when FTS finds nothing, still scoped by owner:
.where(and(
  sql`(${posts.searchVector} @@ ${tsq} OR similarity(${posts.title}, ${q}) > 0.3)`,
  eq(posts.userId, ctx.auth.userId),
))
```

Tune the `0.3` threshold against real data (or `SET pg_trgm.similarity_threshold`); use an
explicit `similarity() > x` comparison rather than the `%` operator so the threshold is in the
query, not session state. A broad `OR` across an FTS index and a trigram index can defeat the
planner on very large tables — if so, split into a `UNION` of two indexed queries and merge.

## 5. Validate the query string at the boundary (Rule 8)

The search term is external input. Zod-parse it at the tRPC procedure before it reaches
`websearch_to_tsquery` — non-empty, length-capped (a multi-kilobyte query is an abuse vector),
trimmed:

```ts
export const searchInput = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.number().int().min(1).max(50).default(20),
});
// search: protectedProcedure.input(searchInput).query(({ ctx, input }) =>
//   searchPosts(ctx, input.q, input.limit))   // ctx scopes by ctx.auth.userId (Rule 2)
```

This is the same shared schema the client search form uses (one schema, no drift — per
`../../../CLAUDE.md`).

## Notes / pitfalls

- `to_tsvector` config matters: `'english'` stems and drops stop-words; `'simple'` does neither.
  Index and query with the **same** config or matches silently disappear.
- Always pair the rank with a `LIMIT` — ranking is computed per candidate row.
- A generated column cannot reference other generated columns or volatile functions; keep the
  expression pure over the base columns.
