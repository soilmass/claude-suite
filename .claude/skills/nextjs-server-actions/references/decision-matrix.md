Purpose: decide Server Action vs tRPC procedure for a mutation on the decided edge stack, with the criteria that force each branch.

# Default

**tRPC is the default for mutations.** The stack chose tRPC (CLAUDE.md spine) precisely
because it gives an unbroken type chain (rule 1) from Drizzle inference → procedure →
client hook, one shared Zod schema, and a uniform place for the ownership check (rule 2).
A Server Action is the deliberate exception, not the reflex. If you cannot name a concrete
reason from the "Pick a Server Action" column below, pick tRPC and hand to `vertical-slice`.

# Decision table

| Criterion | Server Action | tRPC procedure |
| --- | --- | --- |
| Must work with JS disabled / before hydration (true progressive enhancement) | yes — `<form action={fn}>` | no |
| Typed client consumer (hooks, optimistic updates, cache invalidation) | weak — return type only | yes — end-to-end inference |
| Mutation is page-local, single consumer, no shared router value | reasonable | acceptable but heavier |
| Needs server-side `redirect()` / `revalidatePath` immediately after | natural fit | possible but indirect |
| Part of a schema → API → UI feature slice | no — too narrow | yes — use `vertical-slice` |
| Reads/refreshes Next's data cache as the source of truth | natural fit | works, but cache lives elsewhere |
| Reused across many components / platforms (e.g. a future mobile client) | no | yes |

# The forcing questions

1. **Is progressive enhancement an actual requirement here?** If the form must submit and
   show errors with JavaScript disabled or before the bundle hydrates, that is the single
   strongest reason to choose a Server Action. If it is a hypothetical "nice to have," it
   is not forcing — prefer tRPC.
2. **Who consumes the result?** A typed client that wants optimistic UI, cache
   invalidation, and inferred types → tRPC. The page itself, via revalidation/redirect →
   Server Action.
3. **How wide is the blast radius?** One self-contained form on one page → an action can be
   justified. Anything reused, or part of a larger feature → tRPC via `vertical-slice`.

# Edge-runtime notes

- Both Server Actions and tRPC procedures run on the edge runtime here. Use `auth()` from
  Clerk (edge-compatible) for the session in either; the ownership check (rule 2) is
  identical work in both — choosing an action never removes it.
- Use the edge-compatible Drizzle driver in the action's mutation function exactly as a
  tRPC procedure would. No long-lived TCP pool.
- A Server Action is a `'use server'` POST endpoint: it is as publicly reachable as a tRPC
  mutation. "It's only rendered for the owner" is not a control.

# Record the fork

When you choose a Server Action over tRPC for a given mutation, record it in `DECISIONS.md`
with the date and the forcing reason (e.g. "checkout form must submit pre-hydration —
Server Action over tRPC, 2026-06-26"). The default is tRPC, so the deviation is what needs
a record, not the default.
