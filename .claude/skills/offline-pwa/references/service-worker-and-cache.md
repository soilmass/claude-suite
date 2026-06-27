Purpose: service worker registration, the install/activate/update lifecycle, versioned caches + skipWaiting, the per-request-class cache strategy table, the authed-response boundary, and the offline fallback route.

# Registration

Register from a client leaf after the page loads, so the SW never blocks first paint. Keep it the
smallest possible `"use client"` island (per `nextjs-app-router`).

```tsx
// src/components/sw-register.tsx
"use client";
import { useEffect } from "react";

export function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onLoad = () => navigator.serviceWorker.register("/sw.js").catch(console.error);
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);
  return null;
}
```

# The lifecycle: install → activate → update

The whole "stale forever" failure class lives in these three handlers. **Version the cache name**
(`v3` below): on every deploy that changes precached assets, bump it. `install` precaches the new
version; `activate` deletes every cache that isn't the current version; the update flow gets the new
worker into control without silently swapping assets out from under an in-flight session.

```js
// public/sw.js
const VERSION = "v3";
const PRECACHE = `precache-${VERSION}`;
const RUNTIME = `runtime-${VERSION}`;
// The app shell: the offline fallback + the minimal assets needed to render it.
const SHELL = ["/offline", "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PRECACHE).then((c) => c.addAll(SHELL)));
  // Do NOT skipWaiting() here unconditionally — let the page drive the update (below).
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([PRECACHE, RUNTIME]);
      const names = await caches.keys();
      await Promise.all(names.filter((n) => !keep.has(n)).map((n) => caches.delete(n))); // cleanup
      await self.clients.claim();
    })(),
  );
});

// The page tells a waiting worker to take over, then reloads once — a controlled update.
self.addEventListener("message", (e) => {
  if (e.data?.type === "SKIP_WAITING") self.skipWaiting();
});
```

```tsx
// in SwRegister, using the registration: detect a waiting worker, prompt, then reload exactly once
const reg = await navigator.serviceWorker.register("/sw.js");
reg.addEventListener("updatefound", () => {
  const installing = reg.installing;
  installing?.addEventListener("statechange", () => {
    if (installing.state === "installed" && navigator.serviceWorker.controller) {
      // A new version is ready. Surface a toast: "Update available — reload."
      // On accept: reg.waiting?.postMessage({ type: "SKIP_WAITING" });
    }
  });
});
let reloaded = false;
navigator.serviceWorker.addEventListener("controllerchange", () => {
  if (reloaded) return;
  reloaded = true;
  window.location.reload();
});
```

Why not auto-`skipWaiting()` on install: swapping the controlling worker mid-session can pair a new SW
with an old, already-rendered page and serve mismatched chunks. Let the user accept, then reload once.

# Cache strategy per request class

Route every request to a strategy by what it *is*. The load-bearing line: **authed/secret responses
and all mutations never enter the shared cache** (Rule 9, Rule 2).

| Request class | Examples | Strategy | Why |
| --- | --- | --- | --- |
| Immutable build assets | `/_next/static/*`, fonts, icons | **cache-first** (versioned) | Content-hashed; safe to serve from cache forever, evicted by version bump |
| App-shell navigations | `GET` document requests | **network-first** → cache → `/offline` | A deploy must reach users; fall back only when offline |
| Public cacheable GETs | public, owner-agnostic data | **stale-while-revalidate** | Fast repeat loads; refresh in the background |
| Authed / per-user / secret | `/api/trpc/*`, anything reading `auth()` | **network-only**, never cached | Shared cache would leak across users and outlive sign-out (Rule 9/2) |
| All mutations | `POST`/`PATCH`/`DELETE`, `/api/trpc` mutations | **network-only** (queue if offline) | Never serve a stale write; offline goes to the mutation queue |

```js
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Never touch non-GET, cross-origin, the auth flow, or the API. Let them hit the network.
  if (request.method !== "GET") return;                       // mutations: queued elsewhere
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;               // authed/secret — network-only (Rule 9/2)
  if (url.pathname.startsWith("/sign-in") || url.pathname.startsWith("/sign-up")) return; // Clerk

  // 2. Immutable assets: cache-first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 3. Navigations: network-first, fall back to cache, then the offline shell.
  if (request.mode === "navigate") {
    event.respondWith(networkFirstWithOffline(request));
    return;
  }
});

async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) (await caches.open(RUNTIME)).put(request, res.clone());
  return res;
}

async function networkFirstWithOffline(request) {
  try {
    const res = await fetch(request);
    if (res.ok) (await caches.open(RUNTIME)).put(request, res.clone());
    return res;
  } catch {
    return (await caches.match(request)) ?? (await caches.match("/offline")) ?? Response.error();
  }
}
```

The guard rails matter more than the happy path: the early `return`s for non-GET, `/api/`, and the
auth routes are what keep authed responses out of Cache Storage. If you cannot easily exclude an
authed GET by path, exclude it by checking for an `Authorization`/cookie-derived signal — but the
simplest correct default is *never cache anything under `/api/`*.

# The offline fallback route

A precached App Router segment (`nextjs-app-router`), served by `networkFirstWithOffline` when the
network fails and nothing matches. It is the whole-app no-network state — honest, branded, actionable
— not the four component states of a single data view (Rule 4 still applies to those when online).

```tsx
// src/app/offline/page.tsx — a Server Component; static, so it precaches cleanly.
export default function Offline() {
  return (
    <main className="grid min-h-dvh place-items-center p-8 text-center">
      <div className="max-w-prose space-y-4">
        <h1 className="text-2xl font-semibold">You're offline</h1>
        <p className="text-muted-foreground">
          Your work is saved on this device and will sync automatically when you're back online.
        </p>
      </div>
    </main>
  );
}
```

Styling stays token-driven (Rule 3) — no raw hex/px. Keep the page dependency-free so it renders with
only precached assets.
