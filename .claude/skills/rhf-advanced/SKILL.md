---
name: rhf-advanced
description: >
  React Hook Form depth on the decided edge stack: wiring the ONE shared zodResolver,
  building correct `useFieldArray` lists, doing async/server-backed validation without
  races, and mapping tRPC/server errors back onto the offending fields (and onto a root
  error when they belong to no field). The leaf of the type chain where forms quietly
  drift from the schema and swallow server errors.
  Use when: "react hook form", "field array", "async form validation", "show server
  errors on form".
  Do NOT use for: building the whole feature slice (use vertical-slice), or authoring
  the Zod schema itself (use zod-schema-library).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the form-leaf failure class: a re-declared resolver
    schema, index-keyed field arrays, racing async validators, and silently swallowed
    server errors. Baseline observed (clean-room capture).
---

# rhf-advanced

The advanced React Hook Form patterns that sit at the leaf of the type chain. This skill
covers the four places generated forms go wrong past the happy path: the resolver, field
arrays, async validation, and server-error mapping. The spine and the nine rules live in
`../../CLAUDE.md`; this skill obeys them — chiefly rule 1 (unbroken types), rule 8
(validated boundaries), and rule 9 (no secrets client-side).

---

## Non-Negotiable Rules

These are observed, compiles-anyway failures in generated form code:

- **Never re-declare the schema at the form.** `useForm` takes the *same* Zod object the
  tRPC input takes, imported from `zod-schema-library`. A second "matching" schema drifts
  — this is the rule-8 / one-schema discipline at the leaf.
- **Never key a field array by array index.** Key by the `field.id` `useFieldArray`
  gives you; index keys corrupt React state on reorder/remove.
- **Never swallow a mutation error.** Every server error is mapped — to the field via
  `setError(name, …)` when it is a field error, to `setError("root.serverError", …)`
  when it is not. An error toast alone is not done; the form must show it (rule 4: the
  error state is one of the four).
- **Never validate against the server with an untyped `fetch`.** Async/uniqueness checks
  call a tRPC procedure: typed (rule 1), Zod-validated (rule 8), no client secret (rule 9).

Refuse these rationalizations: "a quick second schema on the form is fine"; "index keys
work for now"; "the toast already shows the error"; "I'll just fetch the check directly."

---

## When to Use

- A form needs `zodResolver` wired to the shared schema with correct inferred types.
- A form has a repeating group (line items, tags, contacts) needing `useFieldArray`.
- A field needs async/server-backed validation (uniqueness, availability).
- Server/tRPC validation errors must surface on the right fields, not just a toast.

## When NOT to Use

- You are building the full feature (model → procedure → form → UI) → `vertical-slice`.
- You are authoring or changing the Zod schema itself → `zod-schema-library`.
- You are checking finished form code against the rules → `rule-audit`.
- The form's a11y (labels, focus, error association) is the question → `a11y-gate`.

---

## Procedure

1. **Confirm the shared schema exists, do not invent one (low-interrogation).** Locate
   the operation's schema in `zod-schema-library` and import it. If it is missing or wrong
   shape, stop and hand to `zod-schema-library` rather than declaring a local copy. See
   `references/resolver-and-server-errors.md`.

2. **Wire the resolver with inferred types.** `useForm<z.input<typeof schema>>` (use
   `z.input` when the schema has coercions/transforms so field types match the form), pass
   `resolver: zodResolver(schema)`, and supply complete `defaultValues` — arrays default
   to `[]`, never `undefined`, or `useFieldArray` and controlled inputs break (rule 1: no
   `any` to paper over an undefined default).

3. **Build field arrays by id, register by path.** `useFieldArray({ control, name })`,
   map with `field.id` as the React key, register inputs as `` `${name}.${index}.field` ``.
   Use `append`/`remove`/`move`/`replace` from the hook, not manual array mutation. See
   `references/field-arrays-and-async.md`.

4. **Add async validation without races (medium-interrogation).** Decide: schema-level
   async `.refine` (re-runs on submit and per `mode`) vs a per-field `validate` returning a
   Promise. Either way the check calls a **tRPC procedure**, is debounced, and guards
   against out-of-order responses (track the latest input or `AbortController`). Set a
   sensible `mode`/`reValidateMode` so it does not fire on every keystroke. See
   `references/field-arrays-and-async.md`.

5. **Map server errors onto fields (high-interrogation — this is where it ships broken).**
   In the mutation's `onError`, narrow the `TRPCClientError`, read
   `error.data?.zodError?.fieldErrors`, and `setError` each onto its field; route anything
   field-less to `setError("root.serverError", …)`. Render `formState.errors.root` near
   the submit. See `references/resolver-and-server-errors.md`.

6. **Render the error and pending states.** Disable submit on `isSubmitting`, surface
   `errors.root.serverError`, and show field errors inline — the form is the error state
   of rule 4, so it must be visible, not just logged.

7. **Self-check against the rules.** One shared schema? id-keyed arrays? async via tRPC,
   debounced, race-safe? every server error mapped and shown? If you resolved a fork (e.g.
   chose `onBlur` async over submit-only), record it in `DECISIONS.md`.

---

## Composes With

- **Consumes:** `zod-schema-library` — the single schema this form's resolver and the
  tRPC input both import.
- **Pairs with:** `vertical-slice` — the slice builds the chain; this skill is invoked
  for the form leaf when it needs arrays, async validation, or server-error mapping.
- **Feeds:** `rule-audit`, `a11y-gate` — they inspect the form this skill produces.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project conventions). The encoded failure class was confirmed.

**Observed run.** Asked to wire a dynamic invoice form (line items via `useFieldArray`, shared Zod resolver, tRPC mutation with server errors mapped back to fields), the naive run did get the shared-schema and `field.id` keying right — but it carried money as JS floats in dollars and invented a brittle untyped server-error channel. The mutation overloaded `err.message` with a `"field:message"` string convention and the client `.split(":")` it back apart, instead of reading structured `zodError.fieldErrors` off the typed `TRPCClientError`.

```ts
// server: throws an ad-hoc string instead of a structured field error
throw new TRPCError({ code: "BAD_REQUEST", message: "customer:This customer is blocked" });

// client onError: parses the message string back into a field name
const [field, ...rest] = err.message.split(":");
if (rest.length) setError(field as keyof InvoiceInput, { message: rest.join(":") });

// money as floats in dollars
unitPrice: z.coerce.number().positive("Must be > 0"), // dollars
const total = input.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
```

**Failure class (confirmed).** Generated "advanced" forms reach the demo with the server-error boundary untyped and stringly-typed — a `"field:message"` convention that bypasses the typed `zodError` channel (rule 1, rule 8) and silently breaks the moment a message contains a colon. Alongside it, money rides as floats (rule 5) and the success path is an `alert()` rather than a real four-state treatment (rule 4). This skill forces the typed `TRPCClientError` → `setError`/`root.serverError` mapping that the naive run improvises around.

---

## Examples

**Input:** "Wire up the form for creating an invoice with line items."
**Output:** Imports `createInvoiceSchema` from `zod-schema-library` (no second schema) →
`useForm` with `zodResolver` and `defaultValues.lineItems = []` → `useFieldArray` for
`lineItems`, rows keyed by `field.id`, amounts handled as integer minor units at the
schema (rule 5, owned by the schema) → submit disabled while pending → mutation `onError`
maps `zodError.fieldErrors` onto each line-item field and routes a "duplicate invoice
number" server error to `root.serverError`, shown above the submit button.

**Input:** "Show server errors on the signup form and check the username isn't taken."
**Output:** Per-field async `validate` on `username` calling a `checkUsername` tRPC
procedure, debounced with a latest-call race guard, `mode: "onBlur"` → mutation `onError`
narrows `TRPCClientError`, `setError("username", …)` on a server-side uniqueness collision,
`setError("root.serverError", …)` otherwise → both render inline; no client secret (rule 9).

---

## Edge Cases

- **Schema has `.transform`/`z.coerce`** → type the form with `z.input<typeof schema>`,
  not `z.infer`, so field values match pre-transform shape; consume `z.output` after parse.
- **Async check must hit a secret/3rd-party API** → do it server-side in the tRPC
  procedure, never client-side (rule 9); the form awaits the procedure result.
- **Nested field arrays (array within an array row)** → call `useFieldArray` in a child
  component scoped to that row with its own `control`; do not flatten paths by hand.
- **Server returns a non-field error (rate limit, conflict)** → `root.serverError`, not a
  silent toast; the form's error state (rule 4) must reflect it.

---

## References

- `references/resolver-and-server-errors.md` — the shared-schema resolver wiring and the
  exact tRPC `TRPCClientError` → `setError`/`root.serverError` mapping pattern.
- `references/field-arrays-and-async.md` — `useFieldArray` done right (id keys, path
  registration) and async validation that is debounced and race-safe via tRPC.

## Scripts

`scripts/` is reserved. A codemod to flag inline-redeclared resolver schemas or
index-keyed field arrays would earn its place if test transcripts show those two defects
recurring; empty for now.
