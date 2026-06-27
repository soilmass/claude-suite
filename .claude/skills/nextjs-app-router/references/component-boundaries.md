Purpose: where the server/client boundary falls in an App Router tree, and how to keep secrets server-only (Rule 9) and the type chain intact (Rule 1).

# Server vs Client Components

## The default is server

Every file under `app/` is a **Server Component** unless it (or an ancestor module it's part
of) carries `"use client"`. Server Components:

- run only on the server (the edge runtime here), never ship their code to the browser;
- can be `async` and `await` data directly (Drizzle queries, `auth()` from Clerk);
- can read server env (`process.env.DATABASE_URL`, Clerk secret keys) safely;
- **cannot** use `useState`/`useEffect`/`useRef`, event handlers, or browser APIs.

A component needs `"use client"` only when it uses one of those client-only features
(interactivity, state, effects, context providers, browser APIs). Mark the **smallest** such
component, as a leaf.

## Boundary placement: push it down, not up

Wrong — the whole subtree becomes client, loses RSC + direct edge data access:

```tsx
// app/dashboard/page.tsx
"use client";                         // ❌ now nothing here can be a server data source
export default function Page() {
  const [open, setOpen] = useState(false);
  return <Header /> /* ...everything client... */;
}
```

Right — server page renders a client island:

```tsx
// app/dashboard/page.tsx  (Server Component)
import { db } from "@/db";
import { Toolbar } from "./toolbar";          // the only "use client" file
export default async function Page() {
  const rows = await db.query.projects.findMany();   // server-only, edge driver
  return (
    <>
      <h1 className="text-fluid-2xl">Dashboard</h1>
      <Toolbar />                               {/* interactive leaf */}
      <ProjectList rows={rows} />               {/* server, gets data as props */}
    </>
  );
}
```

```tsx
// app/dashboard/toolbar.tsx
"use client";
export function Toolbar() {
  const [open, setOpen] = useState(false);
  /* ... */
}
```

A Server Component may render Client Components and pass them **serializable** props. A
Client Component may render Server Components only via `children`/props (it cannot import a
Server Component and call it), so structure server data fetching above the client island.

## The props boundary is serializable-only

Props crossing server → client must be serializable: no functions, no class instances, no
Drizzle query builders, no `Date`-bearing surprises that you expect to keep methods. Pass
plain data. For timestamps, hand the client an ISO string or epoch ms and format at the
display edge (Rule 6) — do not pass server-side formatting helpers across the boundary.

Keep the type chain unbroken (Rule 1): type props with the Drizzle-inferred row type
(`InferSelectModel<typeof projects>`) or a derived type, never `any`.

## Secrets never cross (Rule 9)

Checklist before marking anything `"use client"` or passing a prop:

- Only `NEXT_PUBLIC_*` env vars are readable in client code, and **nothing secret is ever
  named `NEXT_PUBLIC_*`**. Server keys (`DATABASE_URL`, `CLERK_SECRET_KEY`, Stripe secret,
  webhook signing secrets) are read in Server Components / route handlers / server functions
  only.
- Do not "pass the API key down as a prop so the client can call the API." Make the call
  server-side (or via a tRPC `protectedProcedure`) and pass only the result.
- Clerk: `auth()`/`currentUser()` are server-side; on the client use `useAuth()`/`useUser()`
  which expose only public identity, never the secret key.

## Edge runtime notes

- The spine ships on the **edge runtime**. Server Components and route handlers should be
  edge-compatible: the serverless/HTTP DB driver (Neon/Turso class), `clerkMiddleware`, no
  Node-only built-ins (`fs`, `net`, raw `crypto` Node APIs) on a hot path.
- A handler or segment that genuinely needs Node APIs sets `export const runtime = "nodejs"`
  and records the exception in `DECISIONS.md` — the edge default is the fork-defining call.
- `providers.tsx` (the React-Query/tRPC + Clerk client providers) is a `"use client"` file
  imported once in the root `layout.tsx`; that single client boundary at the root is expected
  and fine — it wraps `{children}` which remain server-rendered.
