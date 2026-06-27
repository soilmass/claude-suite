---
name: nextjs-server-actions
description: >
  Decide between a Next.js Server Action and a tRPC procedure for a mutation on the edge,
  and when a Server Action is the right call, write it safely: Zod-parse the untyped
  FormData, check ownership, revalidate the right cache scope, and keep progressive
  enhancement intact. The default is tRPC for typed mutations; a Server Action is the
  exception you reach for deliberately (form-action progressive enhancement, no client
  JS), not the reflex.
  Use when: "server action", "use a server action", "form action", "mutate without trpc".
  Do NOT use for: typed end-to-end mutations (prefer vertical-slice + tRPC), or cache
  reads and revalidation strategy in general (use data-fetching-cache).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the Server-Action failure class: untyped FormData
    crossing the boundary unvalidated, missing ownership on the action, and stale UI from
    forgotten revalidation. Baseline section is the encoded failure class; replace with an
    observed transcript.
---

# nextjs-server-actions

A Server Action is a server mutation invoked directly from a Client or Server Component —
powerful because it works without client JS (progressive enhancement), dangerous because
its input arrives as **untyped `FormData`** and its `'use server'` boundary is as exposed
as any public HTTP endpoint. This skill governs the *decision* (Server Action vs tRPC,
where the stack's default is tRPC) and the *safe shape* when an action is chosen.

The spine and the nine inviolable rules live in `../../CLAUDE.md`. This skill does not
restate them — it enforces them at a boundary that makes them easy to forget.

---

## Non-Negotiable Rules

A Server Action's input is `FormData`, which TypeScript types as `string | File`. That
single fact is why every rule below is a *baked-in* failure here, not a stylistic one:

- **Never trust the action signature's types.** `formData.get('amount')` is not a number,
  not validated, not safe. Zod-parse the whole `FormData` into a typed object before any
  use (rule 8). The `(prevState, formData)` signature lies about its safety.
- **Never skip the ownership check because "it's just a form."** A `'use server'` function
  is a callable endpoint; anyone can POST to it. Verify the row belongs to
  `ctx.auth.userId` via Clerk's `auth()` before mutating (rule 2). Authentication via
  middleware is not authorization.
- **Never leave the UI stale.** A successful action that does not `revalidatePath` /
  `revalidateTag` (or `redirect`) leaves the user staring at pre-mutation data. The
  mutation "worked" and looks broken.
- **Never return an unvalidated success path only.** The return shape must carry field
  errors and a failure branch so the form renders error state (rule 4); a void action that
  throws on bad input breaks progressive enhancement.

Refuse these rationalizations: "FormData is already strings, Zod is redundant"; "the form
only renders for the owner, so no ownership check"; "the page will refresh anyway."

---

## When to Use

- A mutation must work **without client JS** (true progressive enhancement: `<form action={fn}>`).
- A simple, page-local form whose only consumer is one component, where a full tRPC
  router + client hook is ceremony you can justify skipping.
- You need to `redirect` or `revalidatePath` from the server immediately after a mutation
  and the result feeds Next's cache rather than client state.

## When NOT to Use

- You want a typed, end-to-end mutation consumed by client code with optimistic updates →
  `vertical-slice` (tRPC `protectedProcedure` + RHF + the shared Zod schema). This is the
  stack default; prefer it.
- The question is about read caching, `fetch` cache tags, or revalidation strategy across
  the app → `data-fetching-cache`.
- The change spans schema → API → UI as a coherent feature → `vertical-slice`.
- You are auditing finished work → `rule-audit`, `security-pass`.

---

## Procedure

1. **Decide action vs tRPC first (high-interrogation — the costly fork).** Default to
   tRPC. Choose a Server Action only if progressive enhancement (works with JS disabled /
   before hydration) is a real requirement, or the mutation is genuinely page-local with
   no client-side typed consumer. If neither holds, stop and hand to `vertical-slice`.
   Record the choice and its reason in `DECISIONS.md`. See `references/decision-matrix.md`.

2. **Reuse the shared Zod schema, do not invent a second one.** The action validates the
   same entity-operation a tRPC procedure would; import the one shared schema (CLAUDE.md:
   one schema per entity-operation). For `FormData`, parse via the schema — derive a
   `FormData`-shaped coercion (`z.coerce.number()` etc.) rather than hand-reading fields.

3. **Open the action with auth, then ownership (rule 2).** In the `'use server'` function,
   `const { userId } = await auth()` (Clerk, edge-compatible). Reject if absent, then load
   the target row and confirm `row.userId === userId` before mutating. See
   `references/safe-action.md` for the exact guard order.

4. **Parse the boundary before touching data (rule 8).** `schema.safeParse(Object.fromEntries(formData))`.
   On failure, return `{ ok: false, fieldErrors }` — do not throw past the boundary. Only
   the parsed, typed object reaches the plain mutation function (keep the action thin, like
   a tRPC procedure: validate → authorize → call a function → revalidate/return).

5. **Mutate via Drizzle (rules 5, 6, 7).** Edge-compatible driver; money as integer minor
   units, timestamps as `timestamptz`; batch related writes — never loop per-row queries.

6. **Revalidate the exact cache scope, then return typed state.** `revalidatePath('/path')`
   or `revalidateTag('tag')` for the data the action changed, or `redirect()`. Return a
   discriminated `{ ok: true } | { ok: false, fieldErrors }` consumed by `useActionState`
   so the form renders all four states (rule 4). See `references/safe-action.md`.

7. **Wire the form for progressive enhancement.** `<form action={boundAction}>` with
   `useActionState` + `useFormStatus` for pending UI. The form must submit and show errors
   with JS disabled; client niceties (optimistic, disabled-while-pending) layer on top, not
   underneath. Style only through tokens (rule 3).

8. **Self-audit against the boundary rules.** Confirm: schema-parsed FormData? auth +
   ownership? revalidation present? typed error branch + all four states? no second schema?
   Where a call was the user's to make (which cache scope, ownership rule), say so plainly
   rather than presenting a happy-path action as done.

---

## Composes With

- **Consumes:** the shared Zod schema and Drizzle model that `schema-design` /
  `vertical-slice` define; `design-tokens` for any form styling.
- **Pairs with:** `vertical-slice` (the tRPC default this skill defers to for typed
  mutations) and `data-fetching-cache` (owns the read/revalidation strategy this skill
  triggers).
- **Feeds:** `rule-audit`, `security-pass` — an action is a boundary they inspect closely.
- **Hands off:** typed end-to-end mutation → `vertical-slice`; any schema change the
  mutation implies → `migration-author`.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project conventions). The encoded failure class was confirmed.

**Observed run.** Asked to build a todo Server Action, the agent reached for `<form action={createTodo}>` by reflex (never weighing tRPC) and read the input with a raw cast — no Zod parse and no ownership check — then `throw`n a bare `Error` on bad input instead of returning a typed error branch. The form bound directly to the action and `revalidatePath('/todos')` did refresh the list, but the boundary, auth, and error-state handling were all skipped.

```ts
export async function createTodo(formData: FormData) {
  const title = formData.get("title") as string;       // rule 1 + rule 8: cast lies, no Zod parse
  if (!title || title.trim().length === 0) {
    throw new Error("Title is required");               // rule 4: throws past boundary, no field-error branch
  }
  await db.insert(todos).values({ title });             // rule 2: no auth()/ownership, no userId column
  revalidatePath("/todos");
}
```

(The accompanying schema used `timestamp(...)` not `timestamptz` (rule 6); the form hardcoded `bg-blue-600` and inline `style={{ minWidth }}` (rule 3); the page rendered success only, no loading/empty/error (rule 4).)

**Failure class (confirmed).** A Server Action's `FormData` types as `string | File`, so an unchecked `as string` cast satisfies the compiler while leaving the boundary unvalidated (rules 1, 8) and the `'use server'` endpoint unauthorized (rule 2). Throwing past the boundary instead of returning a discriminated error state breaks progressive enhancement and the form's error rendering (rule 4). Every line compiles and the happy demo works, which is exactly why these slip past review.

---

## Examples

**Input:** "Add a server action to let a user update their display name."
**Output:** Confirms progressive enhancement is wanted (else routes to `vertical-slice`) →
imports the shared `updateProfileSchema` → `'use server'` action that calls Clerk `auth()`,
loads the profile row and checks `row.userId === userId` → `safeParse(Object.fromEntries(formData))`,
returning `{ ok: false, fieldErrors }` on failure → Drizzle update → `revalidatePath('/settings')`
→ returns `{ ok: true }` → `<form action>` + `useActionState` rendering pending/error/success
→ records the action-vs-tRPC call in `DECISIONS.md`.

**Input:** "Make this checkout form mutate without tRPC." (money involved)
**Output:** Flags that money must be integer minor units (rule 5) and the amount in
FormData must be `z.coerce`'d and bounds-checked → ownership-scopes the cart to `userId` →
action validates, mutates via Drizzle, `revalidateTag('cart')` → returns typed state with
field errors → suggests `security-pass` for the payment side effect before launch.

---

## Edge Cases

- **The mutation has a typed client consumer wanting optimistic updates** → that is tRPC's
  job; hand to `vertical-slice` rather than bolting client state onto an action.
- **Multiple pages show the mutated data** → `revalidatePath` per page is brittle; use a
  shared `revalidateTag` and coordinate with `data-fetching-cache`.
- **The action needs a file upload** → `FormData` carries `File`; validate type/size with
  Zod before streaming to storage, and never expose the storage secret client-side (rule 9).
- **Action used inside a Client Component event handler (not a `<form action>`)** → you've
  lost progressive enhancement, the main reason to pick an action; reconsider tRPC.

---

## References

- `references/decision-matrix.md` — the Server Action vs tRPC decision table for this edge
  stack, with the criteria that force each branch and what to record in `DECISIONS.md`.
- `references/safe-action.md` — the full safe-action template: guard order (auth →
  ownership → Zod parse), `FormData` coercion, discriminated return shape, revalidation,
  and the `useActionState` + `useFormStatus` form wiring.

## Scripts

`scripts/` is reserved. A grep check flagging `'use server'` functions that read
`formData.get(...)` without a nearby `safeParse` would earn its place if the
unvalidated-boundary failure recurs in transcripts. Empty for now.
