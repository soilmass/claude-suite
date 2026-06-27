# Rules to tests — making the nine inviolable rules provable

Purpose: for each of the nine rules in `../../CLAUDE.md`, the layer that proves it stays fixed
and the shape of the test that does it. `rule-audit` catches violations statically; tests stop
them from regressing. Not every rule is testable — some are owned by the static audit alone.

## Coverage map

| Rule | Provable by test? | Layer | Test shape |
|---|---|---|---|
| 1 — unbroken type chain | No (static) | — | `tsc` / `rule-audit`; no `any`/`@ts-ignore`. Tests don't prove types |
| 2 — auth + ownership | **Yes (critical)** | Integration | Caller B requests caller A's row → `FORBIDDEN`/empty |
| 3 — no hardcoded styles | No (static) | — | `rule-audit` + token lint; not a unit test |
| 4 — all four states | **Yes** | Unit (component) + integration | Render branch tests + procedure error path |
| 5 — money never float | **Yes** | Unit | Arithmetic on minor units; rounding edge cases |
| 6 — UTC timestamptz | **Yes** | Unit | Convert at display boundary; assert tz behavior |
| 7 — no N+1 | **Yes** | Integration | Assert query count over a list is constant |
| 8 — validated boundaries | **Yes** | Unit | Zod schema accepts valid, rejects each invalid |
| 9 — no client secrets | No (static) | — | `rule-audit` / env audit; `env-validation`. Not a test |

The high-value testable four are **2, 5, 7, 8** — they ship looking correct and break silently.

## Rule 2 — ownership (the one to never skip)

Owned by `trpc-integration-test`. The test that matters is the *denial*: seed a row owned by
user A, build a caller whose `ctx.auth.userId` is user B, call the procedure, expect it to
refuse. A test that only checks the owner's happy path does not prove the ownership check
exists — the procedure could be returning rows by id with no `where userId = ctx.auth.userId`
and still pass. Always pin the negative case.

```ts
// integration — shape only; trpc-integration-test owns the harness
const a = await seedUser(); const b = await seedUser();
const row = await seedOrder({ userId: a.id });
const callerB = appRouter.createCaller(ctxFor(b));   // ctx.auth.userId = b.id
await expect(callerB.order.byId({ id: row.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
```

## Rule 5 — money

Owned by `vitest-unit`. Money is integer minor units or a typed decimal — never a float. Unit
test the arithmetic directly: totals, tax, splits, and the rounding boundaries (e.g. 3-way
split of 100 cents). Asserting `addCents(1099, 200) === 1299` is one fast test; the same bug
found through e2e is a flaky multi-second journey.

## Rule 7 — no N+1

Owned by `trpc-integration-test`. Mocks can't prove this — you need a real DB and a query
counter (instrument the driver, or use the test DB's statement log). Seed N parent rows with
children, call the list procedure, assert the number of SQL statements is constant (1 or 2 via
a Drizzle relational query / join), not proportional to N. The tell in code is a query inside a
`.map()` over rows.

## Rule 8 — validated boundaries

Owned by `vitest-unit`. The shared Zod schema (one schema per entity-operation, used by both
the tRPC input and the RHF form) is pure — test it in isolation: every valid input parses,
every invalid input is rejected with the expected issue. Because the schema is shared, this one
unit test simultaneously covers the API boundary and the form's client validation.

```ts
expect(createInvoiceInput.safeParse({ amountCents: 1000, dueAt: iso }).success).toBe(true);
expect(createInvoiceInput.safeParse({ amountCents: -1 }).success).toBe(false); // negative cents
expect(createInvoiceInput.safeParse({ amountCents: 9.99 }).success).toBe(false); // float, not cents
```

## Rule 4 — four states

Split across layers: the *render branches* (loading, empty, error, success) are component unit
tests with the query mocked at its boundary; the *data paths that produce error vs success* are
integration tests on the feeding procedure (e.g. a not-found returns the error the component
renders). Don't drive all four through e2e.

## Rule 6 — timestamps

Owned by `vitest-unit`. Storage is `timestamptz` UTC; conversion happens only at display. Unit
test the display helper: given a UTC instant and a target zone, assert the rendered local value,
and assert that nothing in the write path stores local time.

## The static-only rules (1, 3, 9)

These are not provable by behavioral tests — a passing test says nothing about whether a `any`
slipped in (1), a hex literal landed in a `className` (3), or a secret leaked into
`NEXT_PUBLIC_*` (9). Leave them to `rule-audit`, the token lint, and `env-validation`. Don't
write theatrical tests that pretend to cover them.
