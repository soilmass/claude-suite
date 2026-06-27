Purpose: shape `error.data` in the single errorFormatter so the client gets structured-but-safe info (expose `zodError` + `code`, strip `stack`/`cause`, mask `INTERNAL_SERVER_ERROR`), then consume that shape on the client onto form fields / `root.serverError`, and keep the taxonomy documented next to the generated reference.

# Shaping `error.data` in the one errorFormatter

There is exactly one `initTRPC...errorFormatter` (owned by `trpc-router-compose`); this skill
decides what it puts in `error.data` and what it removes. Two jobs: **expose** the structured
field-error channel, and **strip/mask** anything that discloses internals (Rule 9).

```ts
// src/server/api/trpc.ts — the single formatter (trpc-router-compose owns the file)
import { initTRPC, TRPCError } from "@trpc/server";
import { ZodError } from "zod";
import superjson from "superjson";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    const isInternal = error.code === "INTERNAL_SERVER_ERROR";
    return {
      // keep tRPC's shape, but take control of message and data
      ...shape,
      // mask the message for 500s; keep the safe, deliberate message for typed errors
      message: isInternal ? "Something went wrong." : shape.message,
      data: {
        ...shape.data,
        code: error.code, // the taxonomy key — the only thing the client branches on
        // the BAD_REQUEST field-error channel (Rule 8) — the ONLY structured field path
        zodError:
          error.code === "BAD_REQUEST" && error.cause instanceof ZodError
            ? error.cause.flatten()
            : null,
        // a correlation id so support can find the logged detail without us shipping it
        correlationId: getCorrelationId(),
        // NEVER include error.stack or the raw cause here — that is the Rule 9 leak
        stack: undefined,
      },
    };
  },
});
```

Discipline:
- **`zodError` is the only field-error channel.** It is populated solely for `BAD_REQUEST` from a
  `ZodError` cause. Field errors never travel in `message`.
- **Blank `stack`, never add `cause`.** tRPC's default development shape includes `stack`;
  explicitly blank it so a stack never reaches the browser regardless of `NODE_ENV`. `cause` is
  not in the default wire shape — keep it that way; it stays a server-side field for logging (Rule 9).
- **Mask `INTERNAL_SERVER_ERROR`.** Its real `message`/`cause` may contain SQL or internals;
  replace with a generic string and emit a `correlationId`. The real error is logged server-side
  (`log-discipline`) keyed by that id.

# Consuming the shape on the client

The client narrows `TRPCClientError<AppRouter>` (typed from `import type { AppRouter }` — Rule 1)
and branches on the structured `data`, never on the message string.

```tsx
import { TRPCClientError } from "@trpc/client";
import type { AppRouter } from "@/server/api/root";

function isTRPCError(e: unknown): e is TRPCClientError<AppRouter> {
  return e instanceof TRPCClientError;
}

const create = api.workspace.create.useMutation({
  onError: (err) => {
    if (!isTRPCError(err)) {
      form.setError("root.serverError", { type: "server", message: "Something went wrong." });
      return;
    }
    const data = err.data; // { code, zodError, correlationId, ... }

    // 1) field errors → onto the offending fields (the rhf-advanced mechanics)
    const fieldErrors = data?.zodError?.fieldErrors as Record<string, string[]> | undefined;
    if (fieldErrors) {
      for (const [name, messages] of Object.entries(fieldErrors)) {
        if (messages?.[0]) form.setError(name as keyof CreateWorkspaceInput, { type: "server", message: messages[0] });
      }
      return;
    }

    // 2) code-level errors → the right affordance, branching on data.code (not the message)
    switch (data?.code) {
      case "CONFLICT":
        // this form's only unique constraint is the slug; a multi-constraint form maps by context
        form.setError("slug", { type: "server", message: err.message }); // safe message from the typed throw
        break;
      case "TOO_MANY_REQUESTS":
        form.setError("root.serverError", { type: "server", message: "Too many attempts — try again shortly." });
        break;
      default:
        // INTERNAL_SERVER_ERROR etc.: show the masked message + the id for support
        form.setError("root.serverError", {
          type: "server",
          message: `${err.message}${data?.correlationId ? ` (ref ${data.correlationId})` : ""}`,
        });
    }
  },
});
```

Rules at the leaf:
- Branch on `data.code`, never `.split(":")` the message. The message is human-facing copy, not a
  transport (Rule 1, Rule 8).
- The error must be **visible** on the form (Rule 4's error state), not only a toast —
  `rhf-advanced` covers the `setError`/`root.serverError` rendering and a11y association.
- `root.serverError` clears on the next submit; per-field errors persist until re-validated.

The detailed field-array and resolver mechanics are `rhf-advanced`'s domain; this skill defines
the `error.data` shape both sides agree on.

# Keeping the taxonomy documented

The mapping table and the not-owned policy are *prose* that must not drift from what the routers
actually throw. `api-docs-from-trpc` enumerates each procedure's `TRPCError` codes from the code
(grepping `new TRPCError({ code })` plus the framework `UNAUTHORIZED`/`BAD_REQUEST`) and wires a
CI drift gate so a router that throws a new code without documenting it fails the build. This
skill supplies the canonical legend those per-procedure code lists are read against — so
`CONFLICT` means the same thing in `workspace.create` and `invoice.update`. Do not maintain a
second hand-written error table per router; document the taxonomy once, generate the per-procedure
lists from the code.
