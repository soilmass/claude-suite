---
name: data-fetching-cache
description: >
  Decide where data is fetched (Server Component vs client) and how it is cached and
  invalidated on the edge: the Next.js fetch cache and its `cache`/`next.revalidate`
  options, `revalidateTag`/`revalidatePath` after mutations, `unstable_cache`/`cache()`
  for non-fetch work, and the dynamic-vs-static rendering decision (`dynamic`,
  `revalidate`, `cookies()`/`headers()` as dynamic triggers). Keeps per-user data out of
  shared caches and keeps reads fresh after writes. Use when: "caching", "revalidate",
  "cache invalidation", "dynamic vs static", "fetch on server".
  Do NOT use for: routing structure and the server/client file conventions (use
  nextjs-app-router), optimistic UI and mutation-side cache reconciliation in React
  (use optimistic-updates).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the caching failure class: per-user data cached under a
    shared key, reads stale after a mutation (no revalidateTag), accidental full-route
    static render of authed data, and client fetching that bypasses the server data path.
    Baseline section is the encoded failure class; replace with an observed transcript.
---

# data-fetching-cache

The data-freshness and cache-correctness layer that sits inside the segment shape
`nextjs-app-router` defines. Caching defects compile and demo perfectly: a per-user query
cached under one key serves one user's data to everyone, and a read that never revalidates
shows stale data after every write. This skill decides fetch location, cache scope, and
invalidation so neither happens on the edge. Spine and rules: `../../CLAUDE.md` (edge
runtime, type chain); do not restate them.

---

## Non-Negotiable Rules

Caching turns ordinary code into a security and correctness hazard that looks fine in dev:

- **Never cache per-user data under a shared/static cache entry.** A request reading
  `ctx.auth.userId`-scoped rows must be dynamic (or tagged with a user-scoped tag), never
  collapsed into a route-level static cache shared across users. This is Rule 2 (ownership)
  bleeding into the cache layer.
- **Never leave a read stale after a write.** Every mutation that changes cached data must
  call `revalidateTag(tag)` or `revalidatePath(path)` for exactly what it invalidates.
- **Never fetch user-owned or secret-bearing data from the client to "make it reactive."**
  Read it in a Server Component / tRPC server caller; secrets and the DB driver stay
  server-side (Rule 9). Client fetching is for genuinely client-only, non-secret data.
- **Never widen a cache `revalidate` window without recording why.** Time-based staleness is
  a product call; record non-obvious TTLs in `DECISIONS.md`.

Refuse these rationalizations: "it's the same query so one cache key is fine"; "I'll add
revalidation later"; "fetching it client-side is simpler and it's just the user's own data";
"a 1-hour cache is probably okay" (decide it, don't guess).

---

## When to Use

- Choosing whether a segment renders static, ISR (time-revalidated), or dynamic per request.
- Setting `fetch` cache options (`cache: "force-cache" | "no-store"`, `next: { revalidate, tags }`).
- Wiring `revalidateTag`/`revalidatePath` into a mutation (tRPC procedure or Server Action).
- Wrapping expensive non-`fetch` work (DB reads, computations) in `cache()`/`unstable_cache`.
- Auditing why authed data is being statically cached or why a read is stale after a write.

## When NOT to Use

- The segment file layout, `loading`/`error` files, server/client boundary → `nextjs-app-router`.
- Optimistic UI, client cache reconciliation, rollback on mutation → `optimistic-updates`.
- The mutation's auth/ownership and tRPC shape itself → `vertical-slice` / `trpc-middleware`.
- Edge-driver / DB connection caching specifics → `neon-turso-driver`, `edge-runtime-constraints`.

---

## Procedure

1. **Classify each read: static, ISR, or dynamic (high — getting this wrong leaks or staless).**
   Public, slow-changing → static or ISR. Anything reading `cookies()`/`headers()`/`auth()` or
   per-user rows → dynamic. The presence of `auth()` makes the route dynamic by design; do not
   fight it back into static. See `references/caching-model.md`.
2. **Pick the fetch location before the cache option (high — Rule 9).** User-owned or
   secret-bearing data is read server-side (Server Component or tRPC server caller), never
   client-fetched to gain reactivity. Decide location first; cache scope follows from it.
3. **Set the fetch cache explicitly, never by accident (medium).** Tag cacheable reads with
   `next: { tags: [...], revalidate }`; mark genuinely-per-request reads `cache: "no-store"`.
   Default fetch caching changed across Next versions — be explicit. See `references/caching-model.md`.
4. **Scope cache keys/tags so ownership holds (high — Rule 2).** A user-scoped read gets a
   user-scoped tag (e.g. `` `notes:${userId}` ``) or stays dynamic; never a bare entity tag on
   per-user data. Verify no shared entry can serve another user's rows.
5. **Invalidate on every mutation (high — staleness is silent).** In the mutating tRPC
   procedure / Server Action, call `revalidateTag`/`revalidatePath` for precisely the data
   changed, after the write succeeds. Pair the write tag and the read tag deliberately.
   See `references/revalidation-patterns.md`.
6. **Wrap expensive non-fetch work in `cache()` / `unstable_cache` (medium).** Dedupe
   per-request DB reads with React `cache()`; persist cross-request with `unstable_cache` plus
   tags — but only for non-user-scoped or correctly-keyed data. Avoid N+1 (Rule 7) at the
   query, not the cache. See `references/caching-model.md`.
7. **Verify on the edge and record TTL choices (low).** Confirm dynamic routes aren't being
   prerendered, confirm a write flips the read, and record any non-obvious `revalidate` window
   in `DECISIONS.md`. Hand the finished slice to `rule-audit`.

---

## Composes With

- **Pairs with:** `nextjs-app-router` (this is the data semantics inside its segment files),
  `optimistic-updates` (client-side reconciliation; this owns the server cache + invalidation).
- **Consumes:** `trpc-router-compose` / `trpc-middleware` (the procedures whose reads are
  cached and whose mutations trigger revalidation), `drizzle-relational-queries` (the queries
  being cached — fix N+1 there, Rule 7).
- **Hands off:** ownership/secret/type findings → `rule-audit` (Rules 1, 2, 9); abuse-of-cache
  threat questions → `security-pass`; stale Next cache-default facts → `perishable-refresh`.
- **Runs against:** `../../CLAUDE.md` — edge runtime as the fork-defining fact.

---

## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)

> Encoded failure class per the suite's design; replace with a real run-without-the-skill
> transcript before treating this as evaluated.

**Failure class encoded:** Asked to "make the dashboard load fast," the agent caches a
per-user query under a single route-level static cache (or a bare `tags: ["notes"]`), so the
first user's data is served to every subsequent user — Rule 2 defeated at the cache layer. It
adds `cache: "force-cache"` to an authed read and never wires `revalidateTag`, so after a user
edits a note the list shows the old value until the TTL expires. It moves a fetch to a Client
Component "so it refreshes," dragging the DB read and an env secret toward the client (Rule 9)
and off the edge server path. And it picks a `revalidate: 3600` out of the air with no record
of why. Every path renders correctly in a single-user dev session and looks done.

---

## Examples

**Input:** "The notes list is slow; cache it but it has to update when I add a note."
**Output:** Server-side read tagged `` `notes:${userId}` `` with a sane `revalidate`; the
`create`/`update`/`delete` tRPC procedures call `revalidateTag(`notes:${userId}`)` after the
write. Read stays dynamic-with-tags, never route-static. Ownership tag verified (Rule 2).

**Input:** "Cache the public marketing pricing page."
**Output:** Static render with ISR — `export const revalidate = 3600` on the segment, public
`fetch` left cacheable; no `auth()`/`cookies()` so it prerenders. The 1-hour window recorded in
`DECISIONS.md`. Money on the page rendered from integer minor units (Rule 5), not floats.

**Input:** "Make the user's unread count live without a full reload."
**Output:** Keeps the count server-read and tagged; the mark-as-read mutation calls
`revalidateTag`. If true real-time is needed, that's client reactivity → hand to
`optimistic-updates`; this skill keeps the server cache correct underneath it.

---

## Edge Cases

- **A read calls `cookies()`/`headers()`/`auth()`** → the route is dynamic; don't force it
  static. Cache the underlying non-user computation with `unstable_cache` instead.
- **The same query runs several times in one request** → dedupe with React `cache()` (request
  memoization), not a persistent cross-request cache that could outlive the auth context.
- **A webhook changes data many users read** → invalidate by entity tag from the webhook route
  handler (`revalidateTag`), and validate the webhook body first (Rule 8).
- **Edge driver / `unstable_cache` interaction is unclear** → confirm against
  `edge-runtime-constraints`; cross-request caching of a per-request DB connection is a bug.

---

## References

- `references/caching-model.md` — static/ISR/dynamic decision table, `fetch` cache options,
  dynamic triggers (`cookies`/`headers`/`auth`), `cache()` vs `unstable_cache`, edge notes.
- `references/revalidation-patterns.md` — tag/path naming, user-scoped tags for Rule 2,
  wiring `revalidateTag`/`revalidatePath` into tRPC mutations and Server Actions, webhook invalidation.

## Scripts

Reserved. A script would earn its place if a static check could flag an authed read
(`auth()`/`ctx.auth.userId` in scope) cached under a non-user-scoped tag or `force-cache`, or
a mutation procedure that writes a tagged entity without a matching `revalidateTag` — both are
AST-detectable. Until then `rule-audit` covers Rules 2 and 9.
