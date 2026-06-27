Purpose: the canonical `TRPCError` code set, the domain-failure → code mapping every router shares, the not-owned-row policy (Rule 2), and how to throw a typed error from the plain function so `message` is safe and `cause` stays internal.

# The canonical code set

tRPC ships a fixed enum, `TRPC_ERROR_CODE_KEY`, each key mapped to an HTTP status. Use these
keys verbatim — a custom string code breaks both the HTTP mapping and the client's ability to
narrow on `err.data.code`. The full set is versioned (it has grown over tRPC releases, e.g.
`UNPROCESSABLE_CONTENT`, `BAD_GATEWAY`, `SERVICE_UNAVAILABLE`); the dated specifics perish, so
re-verify against your installed `@trpc/server` and let `perishable-refresh` track it.

The seven that carry almost all application traffic:

| Code                    | HTTP | Use it for                                                        |
|-------------------------|------|-------------------------------------------------------------------|
| `BAD_REQUEST`           | 400  | Input failed validation. Thrown automatically by a failed `.input()` Zod parse (Rule 8); throw it yourself for semantically-invalid-but-well-typed input. |
| `UNAUTHORIZED`          | 401  | Not authenticated. Thrown by `protectedProcedure` when `ctx.auth.userId` is absent. "Who are you?" |
| `FORBIDDEN`             | 403  | Authenticated but not permitted for a resource the caller *can* see. "I know who you are; you may not." |
| `NOT_FOUND`             | 404  | Row missing — **or** present but not owned by the caller (Rule 2, see below). "There is nothing here for you." |
| `CONFLICT`              | 409  | The request collides with current state: unique-constraint violation, duplicate, stale optimistic-lock version. |
| `TOO_MANY_REQUESTS`     | 429  | Rate / quota limit exceeded. |
| `INTERNAL_SERVER_ERROR` | 500  | Unexpected/unhandled failure (a bug, the DB down). The message is **masked** before it reaches the client — see `error-shape-and-client.md`. |

Less common but legitimate: `PRECONDITION_FAILED` (412, e.g. an `If-Match`/version precondition),
`PAYLOAD_TOO_LARGE` (413), `UNPROCESSABLE_CONTENT` (422, syntactically valid but semantically
rejected), `TIMEOUT` (408), and the upstream 5xx family (`BAD_GATEWAY`, `SERVICE_UNAVAILABLE`,
`GATEWAY_TIMEOUT`) for a failing third party. Prefer a primary code unless a secondary one is
genuinely more accurate; document any non-obvious choice.

# Domain failure → code mapping table

This is the table to copy into the project and apply in *every* router. Same situation, same
code, everywhere — that consistency is what a client and the generated reference rely on.

| Domain situation                                          | Code                    |
|----------------------------------------------------------|-------------------------|
| Input fails the shared Zod schema                        | `BAD_REQUEST` (auto)    |
| Caller is signed out / no session                        | `UNAUTHORIZED`          |
| Signed in, lacks the role/permission for a visible thing | `FORBIDDEN`             |
| Row does not exist                                       | `NOT_FOUND`             |
| Row exists but is not owned by the caller                | `NOT_FOUND` (Rule 2)    |
| Unique constraint hit (duplicate slug/email)             | `CONFLICT`              |
| Optimistic-lock / stale version on update                | `CONFLICT` (or `PRECONDITION_FAILED`) |
| Rate / quota limit exceeded                              | `TOO_MANY_REQUESTS`     |
| Upstream third party failed                              | a deliberate 5xx (`BAD_GATEWAY`/`SERVICE_UNAVAILABLE`) or `INTERNAL_SERVER_ERROR` |
| Unexpected / unhandled (bug, DB down)                    | `INTERNAL_SERVER_ERROR` (masked) |

Record any project-specific deviation (e.g. you treat a stale version as `PRECONDITION_FAILED`)
in `DECISIONS.md` so it does not drift per router.

# The not-owned-row policy (Rule 2)

`protectedProcedure` proves authentication, not authorization — the row must still belong to
`ctx.auth.userId` (Rule 2). The subtle call is *which code* a not-owned row returns:

- **Default: `NOT_FOUND`.** Returning `FORBIDDEN` for someone else's row confirms the row
  *exists*, leaking information (a username, that an invoice with that id is real). `NOT_FOUND`
  reveals nothing — to the caller, a row they may not see and a row that does not exist are
  indistinguishable. This is the same policy `api-docs-from-trpc` documents per procedure.
- **Reserve `FORBIDDEN`** for the case where the resource is legitimately *visible* to the caller
  but the *action* is denied (a read-only collaborator trying to edit, an org member without the
  admin role). Here existence is not a secret; the denial is the honest signal.

Decide this once, write it in `DECISIONS.md`, and apply it uniformly. The ownership check itself
lives in the procedure's plain function (`vertical-slice` builds it); `rule-audit` flags its
absence.

```ts
// in the plain business function — load, then assert ownership before anything else
const row = await db.query.invoices.findFirst({ where: eq(invoices.id, input.id) });
if (!row || row.userId !== ctx.auth.userId) {
  // missing OR not-owned collapse to the same answer — no existence disclosure (Rule 2)
  throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
}
```

# Throwing a typed error: safe `message`, internal `cause`

Procedures stay thin (per `../../CLAUDE.md`); the plain function throws. Use `TRPCError`, never a
bare `Error`. The three fields have distinct audiences:

- `code` — the taxonomy key; the only thing the client should branch on.
- `message` — a **safe, user-facing** summary. Assume it reaches the browser. No SQL, no ids of
  other users, no internal hostnames.
- `cause` — the original error (the DB exception, the upstream failure). Kept for **server-side
  logging only**; the formatter strips it before the response ships (see `error-shape-and-client.md`).

```ts
import { TRPCError } from "@trpc/server";

export async function createWorkspace(db: Db, userId: string, input: CreateWorkspaceInput) {
  try {
    const [row] = await db.insert(workspaces).values({ ...input, ownerId: userId }).returning();
    return row;
  } catch (e) {
    if (isUniqueViolation(e, "workspaces_slug_unique")) {
      // expected failure → deliberate code; the raw DB error rides in `cause` for logs, not the wire
      throw new TRPCError({ code: "CONFLICT", message: "That slug is taken", cause: e });
    }
    // anything else is genuinely unexpected → let it surface as a masked 500
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not create workspace", cause: e });
  }
}
```

Never `throw new Error("slug taken")` from this path: tRPC wraps a non-`TRPCError` as
`INTERNAL_SERVER_ERROR`, the client cannot narrow it, and in the default shape its `message`
would leak to the browser. A typed throw is both the correct status and the Rule-9 guard.
