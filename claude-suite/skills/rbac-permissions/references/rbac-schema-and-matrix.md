Purpose: the permission/role types, the default-deny permission matrix as the single source of truth, the `memberships`/`roles` Drizzle tables, the code-matrix-vs-`role_permissions`-table fork, and Clerk org roles as the identity source.

# RBAC schema and the permission matrix

## Permissions first, roles second

A *permission* is a fine-grained capability (`post:delete`). A *role* is a named bundle of
permissions (`editor` = create/update/delete posts). Procedures check **permissions**, never
roles directly — so a role can be reorganized in one place (the matrix) without touching a
single procedure.

```ts
// src/server/api/permissions.ts
export const PERMISSIONS = [
  "post:create",
  "post:update",
  "post:delete",
  "member:invite",
  "role:assign",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = ["admin", "editor", "viewer"] as const;
export type Role = (typeof ROLES)[number];
```

`Permission` and `Role` are unions inferred from `as const` arrays — no hand-written string
type that can drift (Rule 1). A typo in a `permissionProcedure("post:detele")` call is a
compile error.

## The matrix IS the source of truth — and it is default-deny

One declared map from role to its granted permissions, with an accessor that denies anything
not explicitly granted. There is no other place a permission decision is made.

```ts
// src/server/api/permissions.ts (continued)
const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  admin: new Set(PERMISSIONS), // every permission
  editor: new Set<Permission>(["post:create", "post:update", "post:delete"]),
  viewer: new Set<Permission>([]), // read-only; writes are denied by absence
};

/** Default-deny: an unknown role or an absent grant is a denial, never a silent yes. */
export function can(role: Role | undefined, permission: Permission): boolean {
  if (!role) return false; // no role → deny
  return MATRIX[role]?.has(permission) ?? false; // absent grant → deny
}
```

Default-deny is the whole game: the safe failure is *deny*. A new permission added to
`PERMISSIONS` is automatically denied for every role until you explicitly grant it — the matrix
fails closed, not open.

## Role identity: Clerk org roles (default)

Clerk Organizations put the caller's role on the session as `orgRole` (e.g. `org:admin`,
`org:member`). That is the default identity source — no extra query. Map Clerk's string to your
`Role` once, in `permissions.ts`, so the rest of the app (and the middleware) speaks one
vocabulary:

```ts
// src/server/api/permissions.ts (continued) — used wherever ctx.orgRole is read
export function toRole(orgRole: string | null | undefined): Role | undefined {
  switch (orgRole) {
    case "org:admin":
      return "admin";
    case "org:editor": // a Clerk custom role
      return "editor";
    case "org:member":
      return "viewer"; // map Clerk's default member to least privilege
    default:
      return undefined; // unknown → can() denies
  }
}
```

The role is read from the **verified session**, never from client input (Rule 8). A
caller-supplied role is a privilege-escalation primitive.

## The `memberships` table (when roles live in your DB)

If you need finer roles than Clerk's `admin`/`member` defaults and do not use Clerk custom
roles, carry the role on a `memberships` join — the same fork `multitenancy-scoping` records.
Default to the **least** privilege.

```ts
// src/db/schema/memberships.ts
import { pgEnum, pgTable, text, timestamp, uuid, unique, index } from "drizzle-orm/pg-core";

export const orgRole = pgEnum("org_role", ["admin", "editor", "viewer"]);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(), // UUIDv7 for public-facing ids
    orgId: text("org_id").notNull(), // Clerk org id or FK to orgs.id
    userId: text("user_id").notNull(), // Clerk user id
    role: orgRole("role").notNull().default("viewer"), // default-deny: least privilege
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    // one role per (org, user); the lookup the gate runs filters on both
    uniqueMember: unique("memberships_org_user_unique").on(t.orgId, t.userId),
    orgIdx: index("memberships_org_id_idx").on(t.orgId),
    userIdx: index("memberships_user_id_idx").on(t.userId),
  }),
);
```

Conventions (snake_case, both timestamps, indexes on the FKs, the `default("viewer")` choice)
are owned by `schema-design` and `../../../CLAUDE.md`; this table just applies them. The
membership lookup is itself `userId`-scoped (Rule 2) — never trust a requested `orgId` as proof
of membership.

## Fork: matrix in code vs a `role_permissions` table

- **Matrix in code (default).** Typed, reviewable in a diff, part of the type chain, and impossible
  to leave a cell undefined-but-allowed. Pick this unless an org admin must edit roles at runtime.
- **`role_permissions` table.** Only when roles/permissions are genuinely runtime-editable by
  end users. Keep `can()` default-deny over the table (a missing `(role, permission)` row is a
  denial, exactly as the code matrix is). Record the fork in `DECISIONS.md`.

Either way there is exactly **one** source of truth, and it fails closed.
