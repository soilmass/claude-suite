---
name: rbac-permissions
description: >
  Add role-based access control ABOVE per-row ownership: role/membership tables, a
  permission matrix (role × action) as the single source of truth, a default-deny
  permission-check middleware (`permissionProcedure`) layered on the org gate, and
  within-organization roles (admin/editor/viewer) sourced from Clerk org roles. RBAC gates
  the action *class* ("may this role delete posts?"); the ownership/tenant check (Rule 2)
  still gates the specific row. All three coexist — RBAC never replaces the ownership check.
  Use when: "add roles", "admin editor viewer", "role based access", "permission check",
  "who can do what", "role middleware".
  Do NOT use for: per-row ownership that a specific row belongs to the caller (that is Rule 2,
  use vertical-slice), or org/tenant isolation of collections (use multitenancy-scoping).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the RBAC failure class where a role check *replaces* the
    ownership check (Rule 2) instead of augmenting it, where there is no default-deny, and
    where `if (role === "admin")` is scattered across procedures instead of a central
    permission matrix. Baseline section is the encoded failure class; replace with an
    observed transcript.
---

# rbac-permissions

Role-based access control for the edge stack, layered in the right place. Authentication
(`trpc-middleware`) proves *who*; tenant scoping (`multitenancy-scoping`) proves *which org*;
this skill proves the caller's *role* grants the *action class*; and ownership (Rule 2,
`vertical-slice`) still proves the *specific row*. The failure it prevents is the role check
that quietly stands in for the ownership check — an editor who "can delete posts" is handed a
delete-anything primitive because the `where` clause dropped the `orgId`/owner predicate. RBAC
and ownership are different gates; both fire. Spine and the nine rules live in
`../../../CLAUDE.md` (Rule 2 is central); this skill obeys them and does not restate them.

---

## Non-Negotiable Rules

RBAC is where a role check that *looks* like authorization silently replaces the real one:

- **Never let an RBAC check replace the ownership check (Rule 2).** Passing
  `permissionProcedure("post:delete")` proves the role *may* delete posts as a class — it does
  NOT prove this post is in the caller's org or theirs to delete. The query still carries
  `and(eq(id), eq(orgId))` (and the per-user owner predicate where the resource is personal).
  RBAC gates the action class; ownership gates the row. Both, always.
- **Default-deny.** Absence of a grant is a denial. An unknown role, an unmapped permission, or
  a matrix cell you forgot resolves to *no*. `can()` returns `false` for anything not granted.
- **The permission matrix is the single source of truth.** Procedures check *permissions*, not
  roles, and the role→permission map lives in one declared matrix — never as `if (role ===
  "admin")` scattered across procedures, where the rules drift and no one can audit them.
- **Never derive the role from client input.** The role comes from the verified session
  (Clerk `orgRole`) or a `userId`-scoped `memberships` lookup — never a request body, param, or
  header (Rule 8). A caller-supplied role is a privilege-escalation primitive.

Refuse these rationalizations: "the role check covers it, ownership is redundant"; "if it's not
in the matrix it's probably fine to allow"; "a quick `if (role === 'admin')` here is simpler
than the matrix"; "trust the role the client sends, it came from our UI."

---

## When to Use

- Introducing within-org roles (admin/editor/viewer) and gating actions by them.
- Building the `permissionProcedure` / `roleProcedure` middleware and the permission matrix.
- Modeling a `memberships`/`roles` table or wiring Clerk org roles into `ctx`.
- Auditing whether an action class is gated by role *and* the row still gated by ownership.

## When NOT to Use

- Checking that *this* row belongs to the caller → that is Rule 2 ownership, `vertical-slice`.
- Isolating an org's collections so tenant A never reads tenant B's rows → `multitenancy-scoping`.
- Building the base `protectedProcedure` auth gate or rate limiting → `trpc-middleware`.
- Wiring Clerk itself (middleware, organizations, webhooks) → `clerk-auth-flows`.
- Defining the `memberships`/`roles` tables from scratch → `schema-design` (this skill applies
  the convention; it does not own table authoring).

---

## Procedure

1. **Name the permissions before the roles (high — the matrix is load-bearing).** Enumerate the
   fine-grained capabilities (`post:create`, `post:delete`, `member:invite`, `role:assign`) as a
   typed union. Roles are *bundles* of permissions, so procedures check a stable permission while
   roles are reorganized freely. See `references/rbac-schema-and-matrix.md`.
2. **Declare the permission matrix as the source of truth (high).** One `Record<Role,
   Set<Permission>>` with a `can(role, permission)` accessor that is **default-deny** (unknown
   role or absent grant → `false`). Keep it in code (typed, reviewable, part of the type chain)
   unless roles must be edited at runtime — then a `role_permissions` table, recorded as a fork
   in `DECISIONS.md`. See `references/rbac-schema-and-matrix.md`.
3. **Decide the role identity source and record it (medium).** Default: Clerk org roles
   (`ctx.orgRole`) map to your `Role` type at the context edge. If you need finer roles than
   Clerk's defaults, use Clerk custom roles or your own `memberships.role` column — the same
   fork `multitenancy-scoping` records. Default the membership role to the *least* privilege
   (`viewer`). See `references/rbac-schema-and-matrix.md`.
4. **Build `permissionProcedure` on the org gate (high — cost of being wrong is escalation).**
   `permissionProcedure(perm) = orgProcedure.use(...)` throws `FORBIDDEN` when
   `can(toRole(ctx.orgRole), perm)` is false, then `next()` with `ctx` unchanged. It layers
   *above* `orgProcedure` (so `orgId`/`orgRole` are already narrowed) and *below* the per-row
   ownership check. See `references/permission-middleware.md`.
5. **Keep the ownership check in the procedure body — RBAC did not remove it.** After the role
   gate passes, the query still carries `and(eq(id), eq(orgId))` (Rule 2 at tenant scale) and the
   `userId` owner predicate for personal resources. A zero-row write throws `NOT_FOUND`. This is
   the step the baseline drops. See `references/permission-middleware.md`.
6. **Centralize, never scatter.** Every new gated action declares its permission via
   `permissionProcedure`; no inline `if (role === ...)` in a body. A new capability is a matrix
   entry, not an edit across N procedures.
7. **Verify with a deny test, not just an allow test.** Assert a viewer is *rejected* from a write
   and that an authorized role still cannot reach another org's row (ownership independent of
   role). Hand the threat review to `security-pass`.

---

## Composes With

- **Consumes:** `multitenancy-scoping` (extends its `orgProcedure`/`ctx.orgRole` — RBAC layers
  roles onto tenant isolation), `trpc-middleware` (the base `protectedProcedure` gate),
  `clerk-auth-flows` (Clerk org roles as the identity source), `schema-design` (the
  `memberships`/`roles` tables and their indexes).
- **Pairs with:** `vertical-slice` (the per-row ownership check that still runs after the role
  gate), `security-pass` (RBAC + escalation paths are a core threat-model line).
- **Runs against:** `rule-audit` — Rule 2 findings (a role check standing in for ownership)
  point back here.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent told to implement as
> a typical dev would, with no project conventions): "add admin/editor/viewer roles and permission
> checks to our multi-tenant tRPC app." The imagined catastrophe — a role check *replacing* the
> ownership predicate — did NOT occur. A **narrower** failure class was confirmed.

**Observed run.** The agent produced a competent scaffold: Clerk `org:*` roles mapped to app
roles, a single capability matrix (`PERMISSIONS`) instead of scattered `if (role === "admin")`, a
`permissionProcedure(capability)` factory, and — notably — it **kept** the tenant predicate on the
delete:

```ts
export function hasPermission(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role); // cast nicks Rule 1; unmapped perm → throws, not a clean deny
}
// deletePost:
.where(and(eq(posts.id, input.id), eq(posts.orgId, ctx.orgId))) // tenant scope kept ✓ — but authorId ownership never raised
```

Its own note: *"still scopes by orgId in the WHERE clause as defense-in-depth so the role check
and tenant isolation are independent."* It kept tenant scoping — but framed `orgId` as **the** row
guard and never raised per-row **ownership**: the `posts` table carries an `authorId`, yet the
agent never asked whether an editor may delete *another member's* post. Tenant-isolation and
ownership were collapsed into one predicate.

**Failure class (confirmed, narrowed).** Not "role replaces ownership" — a capable base model keeps
the org predicate. The real gaps: it **conflates tenant scoping with ownership** (Rule 2's per-row
owner check, `authorId`, is never considered — only `orgId`); default-deny is *almost* there but an
unmapped permission **throws** rather than denying (no `?? false` fallback); a type cast (`as
readonly Role[]`) nicks the chain (Rule 1); and the optional `memberships` table drops
`updated_at`/`$onUpdate` and standalone FK indexes. This skill adds the missing rigor: the matrix is
explicitly default-deny, the role gate is named as layer 3, and the procedure body still owns the
per-row ownership check (`authorId`/`orgId`) as a separate gate — RBAC gates the action class,
ownership gates the row.

---

## Examples

**Input:** "Add admin/editor/viewer roles and let editors and admins delete posts."
**Output:** Declares `post:delete` in the matrix (admin + editor granted, viewer not);
`deletePost: permissionProcedure("post:delete")` gates the action class. The body **still**
scopes the write: `db.delete(posts).where(and(eq(posts.id, input.id), eq(posts.orgId,
ctx.orgId)))`, zero rows → `NOT_FOUND`. States plainly: the role decides *may delete posts at
all*; the predicate decides *this post, in this org*.

**Input:** "Only admins can invite members."
**Output:** Adds `member:invite` to the matrix (admin only); `invite: permissionProcedure
("member:invite")`. Notes a viewer/editor is `FORBIDDEN` by default-deny, and that the invited
email is still the shared Zod-validated boundary (Rule 8). No `if (role === "admin")` inline.

**Input:** "Where do our Clerk org roles fit?"
**Output:** Clerk `orgRole` is the role *identity*, mapped to the `Role` type at the context
edge; the role→permission *matrix* lives in your code (or Clerk custom permissions), default-deny.
If three roles exceed Clerk's admin/member defaults, use Clerk custom roles or a
`memberships.role` column — fork recorded in `DECISIONS.md`.

---

## Edge Cases

- **A viewer must edit their own row** → that is ownership, not a role; do not invent a role for
  it. RBAC gates the action class; the owner predicate (`vertical-slice`) handles "their own."
- **Roles must be created/edited at runtime by org admins** → move the matrix into a
  `role_permissions` table, keep `can()` default-deny over it, record the fork in `DECISIONS.md`.
- **Clerk ships only `admin`/`member` but you need three roles** → use Clerk custom roles, or
  carry the role in your own `memberships` table (the `multitenancy-scoping` fork), not a third
  role faked in app code.
- **A super-admin/back-office user must act across orgs** → a separate, explicitly named
  `adminProcedure` (see `multitenancy-scoping`), never a normal org role that relaxes the tenant
  predicate. Record it in `DECISIONS.md`.

---

## References

- `references/rbac-schema-and-matrix.md` — permission/role types, the default-deny matrix as
  source of truth, the `memberships`/`roles` Drizzle tables, the code-matrix-vs-`role_permissions`
  fork, and Clerk org roles as the identity source.
- `references/permission-middleware.md` — `permissionProcedure`/`roleProcedure` built on
  `orgProcedure`, default-deny enforcement, why the ownership check still runs in the body, and
  the allow/deny test patterns.

## Scripts

- Reserved; `scripts/.gitkeep` only. A script would be justified if a mechanical check could
  flag a `permissionProcedure(...)` mutation whose body has no `orgId`/owner predicate (the
  RBAC-replaces-ownership tell, AST-detectable) or a matrix with a non-default-deny fallthrough.
  Until those patterns stabilize, `rule-audit` (Rule 2) and the deny test cover the surface.
