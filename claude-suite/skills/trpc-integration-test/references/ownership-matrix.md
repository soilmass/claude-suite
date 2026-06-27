Purpose: the assertion patterns — the three-case ownership matrix (rule 2), the Zod-boundary check (rule 8), and the inferred-type success-shape check (rule 1) — that make a tRPC integration test prove something.

# Assertions that prove rule 2 and rule 8

## 1. The `TRPCError.code` assertion helper

Always assert the *code*, not just that something threw. A thrown `TRPCError` carries
`name: "TRPCError"` and a `code`; `toMatchObject` reads both.

```ts
// test/helpers/expect-trpc.ts
import { expect } from "vitest";
import type { TRPC_ERROR_CODE_KEY } from "@trpc/server";

export async function expectTRPCError(
  promise: Promise<unknown>,
  code: TRPC_ERROR_CODE_KEY,
) {
  await expect(promise).rejects.toMatchObject({ name: "TRPCError", code });
}
```

## 2. The ownership matrix (rule 2)

For every `protectedProcedure` over a user-owned row, all three cases are mandatory. The
non-owner code is whatever the procedure returns to avoid leaking existence — `NOT_FOUND`
(masking) is common; `FORBIDDEN` if existence is already known. Assert the one the procedure
actually uses, and assert the row was *not* mutated.

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { callerFor } from "./helpers/caller";
import { makePost } from "./helpers/factories"; // from test-data-factories
import { testDb } from "./helpers/db";
import { posts } from "~/db/schema";
import { eq } from "drizzle-orm";

const OWNER = "user_owner";
const OTHER = "user_other";

describe("post.delete ownership", () => {
  let postId: string;
  beforeEach(async () => {
    const row = await makePost({ userId: OWNER }); // seed directly, not via the procedure
    postId = row.id;
  });

  it("owner can delete own post", async () => {
    await expect(callerFor(OWNER).post.delete({ id: postId })).resolves.toMatchObject({
      id: postId,
    });
    const after = await testDb.query.posts.findFirst({ where: eq(posts.id, postId) });
    expect(after).toBeUndefined();
  });

  it("non-owner cannot delete another user's post", async () => {
    await expectTRPCError(callerFor(OTHER).post.delete({ id: postId }), "NOT_FOUND");
    // critical: the row must survive the denied call
    const after = await testDb.query.posts.findFirst({ where: eq(posts.id, postId) });
    expect(after?.id).toBe(postId);
  });

  it("unauthenticated caller is rejected", async () => {
    await expectTRPCError(callerFor(null).post.delete({ id: postId }), "UNAUTHORIZED");
  });
});
```

The non-owner assertion that the row *survives* is what catches a missing
`.where(eq(posts.userId, ctx.auth.userId))`: without the filter the delete succeeds, the row
disappears, and `after?.id` is `undefined` — red.

### List queries leak too

A list/query procedure has its own ownership shape: it must return only the caller's rows.

```ts
it("list returns only the caller's rows", async () => {
  await makePost({ userId: OWNER });
  await makePost({ userId: OWNER });
  await makePost({ userId: OTHER });

  const rows = await callerFor(OWNER).post.list();
  expect(rows).toHaveLength(2);
  expect(rows.every((r) => r.userId === OWNER)).toBe(true);
});
```

## 3. The Zod boundary (rule 8)

Invalid input must reject `BAD_REQUEST` before any row is read or written. tRPC wraps a Zod
`safeParse` failure into a `BAD_REQUEST` `TRPCError` automatically when the procedure uses
`.input(schema)`.

```ts
describe("post.create input validation", () => {
  it("rejects empty title before touching the db", async () => {
    await expectTRPCError(
      callerFor(OWNER).post.create({ title: "", priceCents: 100 }),
      "BAD_REQUEST",
    );
    const count = await testDb.$count(posts);
    expect(count).toBe(0); // resolver never ran
  });

  it("rejects a float price (money is integer minor units — rule 5)", async () => {
    await expectTRPCError(
      callerFor(OWNER).post.create({ title: "ok", priceCents: 19.99 }),
      "BAD_REQUEST",
    );
  });
});
```

Test the boundary, not the schema's internals — re-testing every Zod rule belongs in
`vitest-unit` against the shared schema. Here you prove the procedure *applies* the schema.

## 4. Success shape against inferred types (rules 1, 5, 6)

The happy path still matters — assert it against the Drizzle-inferred row type so the type
chain is exercised, money stays integer, and timestamps cross the boundary as `Date`.

```ts
import type { InferSelectModel } from "drizzle-orm";

it("create returns a typed row", async () => {
  const row = await callerFor(OWNER).post.create({ title: "Hello", priceCents: 1999 });

  // type assertion: the returned row IS the inferred select model (rule 1)
  const typed: InferSelectModel<typeof posts> = row;
  expect(typed.userId).toBe(OWNER);
  expect(Number.isInteger(typed.priceCents)).toBe(true); // rule 5
  expect(typed.createdAt).toBeInstanceOf(Date); // rule 6 — timestamptz -> Date at the edge
});
```

## Matrix checklist per procedure

- [ ] owner → success, and the side effect actually happened
- [ ] non-owner → correct `TRPCError.code`, and the row is unchanged (no leak/mutation)
- [ ] unauthenticated → `UNAUTHORIZED`
- [ ] invalid input → `BAD_REQUEST` before any row is touched
- [ ] valid input → returns the inferred row type; money integer (rule 5), time `Date` (rule 6)
- [ ] list/query → returns only the caller's rows
