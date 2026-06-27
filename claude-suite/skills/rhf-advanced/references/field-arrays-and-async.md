Purpose: correct `useFieldArray` usage (id keys, path registration, hook mutators) and async validation that is debounced and race-safe by going through a tRPC procedure.

# Field arrays and async validation

## 1. `useFieldArray` — id keys, path registration

`useFieldArray` returns `fields` whose `.id` is a stable RHF-generated key. Key React rows
by `field.id`, NOT the array index — index keys corrupt input state when a middle row is
removed or rows reorder. The array's `defaultValues` must be a real array (`[]`), never
`undefined`.

```tsx
const { fields, append, remove, move } = useFieldArray({
  control: form.control,
  name: "lineItems",
});

return fields.map((field, index) => (
  <div key={field.id}>                       {/* field.id, never index */}
    <input {...form.register(`lineItems.${index}.label`)} />
    <input
      type="number"
      {...form.register(`lineItems.${index}.amountMinor`, { valueAsNumber: true })}
    />
    <button type="button" onClick={() => remove(index)}>Remove</button>
  </div>
));
// add: append({ label: "", amountMinor: 0 })   reorder: move(from, to)
```

Rules:
- Mutate only through `append` / `remove` / `move` / `insert` / `replace` / `update` —
  never push to the underlying array by hand.
- `valueAsNumber` (or `z.coerce.number()` in the schema) keeps numeric fields off the
  `string` default so they match the integer-minor-unit schema type (rule 1 / rule 5).
- Field-level errors live at `errors.lineItems?.[index]?.label`; array-level errors (e.g.
  `.min(1)`) live at `errors.lineItems?.root` or `errors.lineItems?.message`.

## 2. Nested arrays

For an array inside an array row, render that row as its own component and call
`useFieldArray` there with the same `control`, scoped to the nested name
(`lineItems.${index}.taxes`). Do not hand-build deep paths in one component.

## 3. Async validation — debounced, race-safe, via tRPC

Server-backed checks (uniqueness, availability) call a tRPC procedure so the boundary
stays typed (rule 1) and Zod-validated (rule 8) and no secret leaks client-side (rule 9).
Two correct shapes:

### a) Per-field async `validate`

Returns `true` or an error string. Debounce and guard against out-of-order responses so a
stale answer cannot overwrite a fresh one.

```tsx
import { api } from "@/trpc/react";

const utils = api.useUtils();
const seq = useRef(0);
let timer: ReturnType<typeof setTimeout>;

const usernameAvailable = (value: string) =>
  new Promise<true | string>((resolve) => {
    clearTimeout(timer);
    const ticket = ++seq.current;                 // race guard: latest call wins
    timer = setTimeout(async () => {
      try {
        // typed tRPC call — not a bare fetch
        const { available } = await utils.user.checkUsername.fetch({ value });
        if (ticket !== seq.current) return resolve(true); // a newer call superseded us
        resolve(available ? true : "That username is taken");
      } catch {
        resolve(true); // fail-open on the client check; the mutation re-validates server-side
      }
    }, 300);
  });

<input {...form.register("username", { validate: usernameAvailable })} />
```

Set `mode: "onBlur"` (or `"onTouched"`) so the async check does not fire on every
keystroke; `reValidateMode: "onBlur"` keeps it calm after the first error.

### b) Schema-level async `.refine`

When the rule belongs to the schema, `zodResolver` supports an async `safeParseAsync`
automatically. Keep the network call inside the refinement thin and still debounce at the
field if it is keystroke-driven.

```ts
// only when the uniqueness rule is genuinely part of the schema contract
export const usernameSchema = z.object({
  username: z.string().min(3).refine(
    async (v) => (await checkUsernameViaTrpc(v)).available,
    "That username is taken",
  ),
});
```

Trade-off to record in `DECISIONS.md` if non-obvious: per-field `validate` gives finer
control over debounce/mode and is preferred for keystroke checks; schema `.refine` keeps
the rule co-located with the contract but re-runs on every full parse. The **mutation
always re-validates server-side regardless** — the client async check is UX, never the
authority.

## 4. Why client async is never the gate

The async client check can be stale or skipped. The tRPC procedure re-runs the real
uniqueness/ownership check (rule 2) on submit and is the source of truth; a server-side
collision comes back as a `TRPCClientError` mapped via
`references/resolver-and-server-errors.md`.
