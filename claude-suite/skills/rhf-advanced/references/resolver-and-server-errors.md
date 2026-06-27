Purpose: the one-shared-schema `zodResolver` wiring and the exact tRPC error → field/root mapping that keeps server validation visible on the form.

# Resolver and server-error mapping

## 1. One schema, imported — never re-declared

The schema is authored once in `zod-schema-library` and imported by BOTH the tRPC input
and the form. This is rule 8 (validated boundaries) and the one-schema discipline at the
leaf. The form never declares its own copy.

```ts
// src/lib/schemas/invoice.ts  (owned by zod-schema-library)
import { z } from "zod";

export const createInvoiceSchema = z.object({
  number: z.string().min(1),
  // money as integer minor units — rule 5; the SCHEMA owns this, not the form
  amountMinor: z.number().int().nonnegative(),
  lineItems: z
    .array(z.object({ label: z.string().min(1), amountMinor: z.number().int() }))
    .min(1),
});
export type CreateInvoiceInput = z.input<typeof createInvoiceSchema>;
```

```ts
// the procedure imports the SAME object
export const invoiceRouter = createTRPCRouter({
  create: protectedProcedure
    .input(createInvoiceSchema)
    .mutation(async ({ ctx, input }) => {
      // ownership/logic in a called function — see vertical-slice
    }),
});
```

## 2. Resolver wiring with correct inferred types

Use `z.input` for the form generic when the schema has coercions/transforms, so field
values match the pre-parse shape; arrays get a concrete `[]` default. No `any` to silence
a missing default (rule 1).

```tsx
"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createInvoiceSchema, type CreateInvoiceInput } from "@/lib/schemas/invoice";

const form = useForm<CreateInvoiceInput>({
  resolver: zodResolver(createInvoiceSchema),
  defaultValues: { number: "", amountMinor: 0, lineItems: [] }, // arrays: [] not undefined
  mode: "onBlur",
});
```

## 3. Mapping tRPC errors back onto fields

A `protectedProcedure` whose `.input()` rejects throws a `TRPCClientError` whose
`data.zodError.fieldErrors` is the flattened Zod error (when the tRPC `errorFormatter`
exposes `zodError`, which the genesis setup does). Map each onto its field; route anything
field-less to `root.serverError` so the form's error state (rule 4) shows it.

```tsx
import { TRPCClientError } from "@trpc/client";
import type { AppRouter } from "@/server/api/root";

const create = api.invoice.create.useMutation({
  onError: (err) => {
    // err is TRPCClientError<AppRouter> here; narrow defensively for the helper below
    const fieldErrors =
      err instanceof TRPCClientError
        ? (err.data?.zodError?.fieldErrors as Record<string, string[]> | undefined)
        : undefined;

    if (fieldErrors) {
      for (const [name, messages] of Object.entries(fieldErrors)) {
        if (messages?.[0]) {
          form.setError(name as keyof CreateInvoiceInput, {
            type: "server",
            message: messages[0],
          });
        }
      }
      return;
    }
    // business errors (CONFLICT, TOO_MANY_REQUESTS, …) have no field — show at root
    form.setError("root.serverError", { type: "server", message: err.message });
  },
});

const onSubmit = form.handleSubmit((values) => create.mutate(values));
```

Notes:
- `root.serverError` (or any `root.*`) is cleared automatically on the next submit; field
  errors set with `setError` persist until re-validated — pass `{ shouldFocus: true }` on
  the first field error if you want focus moved there.
- Never `setError` on a path that is not in the schema; RHF stores it but it never clears.

## 4. Rendering the error state (rule 4)

The error must be visible on the form, not only in a toast.

```tsx
{form.formState.errors.root?.serverError && (
  <p role="alert" className="text-sm text-destructive">
    {form.formState.errors.root.serverError.message}
  </p>
)}
<button type="submit" disabled={form.formState.isSubmitting || create.isPending}>
  {create.isPending ? "Saving…" : "Save"}
</button>
```

Style only through tokens (`text-destructive`, etc.) — no raw hex/px (rule 3). Associate
the message with the field via `aria-describedby` for `a11y-gate`.
