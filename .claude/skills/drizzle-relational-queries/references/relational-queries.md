Purpose: the Drizzle relational query API (`db.query.*`) — declaring `relations()`, nested `with`, narrowing with `columns`, bounding collections, and many-to-many through a join table. This is the first-choice tool for loading related data in one round trip (Rule 7).

## 1. The relational query API only sees `relations()`

`db.query.<table>.findMany/findFirst` resolves `with` using relations declared via the
`relations()` helper — a foreign-key column alone is not enough. Declare both sides.

```ts
// src/db/schema/projects.ts
import { relations } from "drizzle-orm";
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id").notNull(),            // Clerk userId
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  title: text("title").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// one project has many tasks
export const projectsRelations = relations(projects, ({ many }) => ({
  tasks: many(tasks),
}));

// each task belongs to one project
export const tasksRelations = relations(tasks, ({ one }) => ({
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
}));
```

The `db` instance must be created with the full schema (including the `*Relations`) so
`db.query` is typed:

```ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
```

If a relation you need is not declared, that is `schema-design`'s job — add it there.
Do NOT fall back to a per-row loop because `with` "doesn't work."

## 2. Load parent + children in one query

```ts
// inside a thin protectedProcedure (vertical-slice owns the procedure shell)
const rows = await db.query.projects.findMany({
  where: eq(projects.ownerId, ctx.auth.userId),   // Rule 2: ownership at the root
  with: {
    tasks: {
      columns: { id: true, title: true, status: true }, // Rule 1: narrow the type/payload
      orderBy: (t, { desc }) => desc(t.createdAt),
      limit: 50,                                          // bound the collection
    },
  },
});
// rows: { id, ownerId, name, createdAt, tasks: { id, title, status }[] }[]  — fully inferred
```

Key options on `findMany`/`findFirst`:
- `where` — filter the root rows. Anchor ownership here, not after the fetch.
- `columns: { col: true }` — allow-list root columns (or `{ col: false }` to omit).
- `with` — relations to hydrate; recurse for nested `with`.
- `orderBy`, `limit`, `offset` — on the root and, independently, inside each relation.
- `extras` — computed columns via `sql<...>`.

Never reshape the result with `as`. The inferred type is the contract (Rule 1); if it is
wrong, the `relations()` or the `with` request is wrong.

## 3. Nested relations

`with` nests arbitrarily. Each level may carry its own `columns`/`limit`/`orderBy`/`where`.

```ts
await db.query.projects.findMany({
  where: eq(projects.ownerId, ctx.auth.userId),
  with: {
    tasks: {
      limit: 20,
      with: {
        assignee: { columns: { id: true, name: true } }, // task -> one user
      },
    },
  },
});
```

## 4. Many-to-many through an explicit join table

Drizzle models m2m as two one-to-many relations to the join table; traverse it in `with`.

```ts
export const postsToTags = pgTable("posts_to_tags", {
  postId: uuid("post_id").notNull().references(() => posts.id),
  tagId: uuid("tag_id").notNull().references(() => tags.id),
}, (t) => ({ pk: primaryKey({ columns: [t.postId, t.tagId] }) }));

export const postsToTagsRelations = relations(postsToTags, ({ one }) => ({
  post: one(posts, { fields: [postsToTags.postId], references: [posts.id] }),
  tag:  one(tags,  { fields: [postsToTags.tagId],  references: [tags.id] }),
}));
export const postsRelations = relations(posts, ({ one, many }) => ({
  author: one(users, { fields: [posts.authorId], references: [users.id] }),
  postsToTags: many(postsToTags),
}));

const feed = await db.query.posts.findMany({
  with: {
    author: { columns: { id: true, name: true } },        // many-to-one
    postsToTags: { with: { tag: true } },                 // -> [{ tag: {...} }]
  },
});
```

## 5. Bounding rules (Rule 7 + edge payloads)

- On a **list** endpoint, every collection relation needs a `limit` + deterministic
  `orderBy`. Unbounded `with` on a list is a payload bomb.
- If you only need a **count/sum**, do not hydrate rows — aggregate with a join
  (`references/joins-and-aggregates.md`).
- `findFirst` for a single-parent detail view; `with` collections may stay larger there,
  but still consider pagination for big sets.

## Anti-patterns this replaces

```ts
// ❌ N+1 — one query per project (Rule 7)
const projs = await db.query.projects.findMany({ where: eq(projects.ownerId, uid) });
const out = await Promise.all(projs.map(async (p) => ({
  ...p,
  tasks: await db.query.tasks.findMany({ where: eq(tasks.projectId, p.id) }),
})));

// ❌ leaks other users' rows then filters in JS (Rule 2)
const allTasks = await db.query.tasks.findMany();
const mine = allTasks.filter((t) => owned.has(t.projectId));

// ✅ one query, scoped, bounded, inferred  (see §2)
```
