# Enumerating blast radius across the type chain

The refactor's safety comes from the compiler, but only for sites the type chain
actually reaches. Know the difference.

## The chain, root to leaf
1. **Drizzle schema** (`src/db/schema/`) — the root. Change here.
2. **Inferred types** (`$inferSelect`/`$inferInsert`) — propagate automatically.
3. **Shared Zod schemas** (`src/features/*/schema.ts`) — update; consumers are typed.
4. **tRPC routers** — input/output types shift; compiler flags mismatches.
5. **Router output inference** (`inferRouterOutputs`) — component data types shift.
6. **Forms (RHF)** — resolver + field names.
7. **Components** — every consumer of the changed shape.

## What the compiler WILL catch (let it drive)
- Renamed/removed fields used anywhere typed.
- Changed types flowing through inference.
- Missing required fields after a shape change.
Strategy: change the root, run `tsc --noEmit`, fix each error at its site, repeat until
green. Green = complete.

## What the compiler will NOT catch (manual review — flag these)
- **String-keyed access**: `row["title"]`, dynamic property access.
- **Reflection / serialization**: JSON shapes, API payloads typed as `unknown`/`any`.
- **Raw SQL** strings referencing old column names.
- **Test fixtures / seed data** with hardcoded old shapes.
- **External consumers** (other services, stored webhooks) — out of this repo's chain.
- **Migration files** — handled by migration-author, not edited here.

List every WILL-NOT site explicitly in the scope confirmation so the user knows where the
type chain's guarantee stops.
