Purpose: the worth-it / scope decision, the `app/manifest.ts` web app manifest (tokens not hex, maskable icons, installability criteria), and the installability-only path.

# Is a PWA worth it, and what does "offline" mean here

The default on this stack is **server-first at the edge** — online by default. A service worker
inverts that: it makes the app run from a local cache and reach the network second. That buys
offline, but it costs you a permanent cache-coherence problem (every deploy must invalidate the
right caches) and an update story (a stale SW can pin users to a broken old build). So the first
question is not "how" but "should we."

**Worth it when** the app is genuinely used away from reliable connectivity and a failure there is
real: a delivery driver logging drops in a dead zone, a field inspector in a basement, a warehouse
scanner on flaky wifi, an event app in a packed hall. The user *will* be offline and *must* keep
working.

**Not worth it when** users are reliably online: an internal admin dashboard, a marketing site, a
desktop B2B SaaS. There, a SW adds the update/coherence burden for an offline path nobody exercises.
If they only want the *installed-app feel*, that's the manifest alone (below) — no service worker.

**Scope "offline" narrowly.** Even when a PWA is warranted, you rarely make the *whole* app offline.
Name the exact screens that must render offline, the exact data that must be available, and the exact
actions that must queue. Everything else stays online-only and shows the offline fallback. Record the
decision and the scope in `DECISIONS.md` — this is a deliberate deviation from the server-first spine.

```
DECISIONS.md
2026-06-27 — offline-pwa opt-in. Scope: the delivery-log screen and the log-delivery
mutation work offline; all other screens are online-only and show /offline. Rationale:
drivers lose signal in the field; a dropped log is a real operational failure.
```

# The web app manifest (`app/manifest.ts`)

App Router generates the manifest from a typed file — no hand-edited JSON, no drift. Pull
`theme_color`/`background_color` from the resolved design-token values, never a hardcoded hex
literal (Rule 3): read the computed `@theme` CSS variable at build time or keep a single
token-derived constant, so a palette change can't leave the manifest behind.

```ts
// src/app/manifest.ts
import type { MetadataRoute } from "next";
// brandColors is the single source derived from the @theme tokens — not a fresh hex here (Rule 3).
import { brandColors } from "~/styles/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fieldlog",
    short_name: "Fieldlog",
    description: "Log deliveries in the field, online or off.",
    start_url: "/",
    scope: "/",
    display: "standalone",         // app window, no browser chrome
    orientation: "portrait",
    theme_color: brandColors.surface,      // token-derived, not "#0b0b0c"
    background_color: brandColors.surface, // matches the splash so the launch isn't a flash
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // A maskable icon fills the platform's safe-zone shape (no letterboxing on Android).
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
```

`metadata` wires it (App Router links the manifest automatically when `manifest.ts` exists; set the
themed meta explicitly for installability and iOS):

```ts
// src/app/layout.tsx
export const metadata = {
  applicationName: "Fieldlog",
  appleWebApp: { capable: true, title: "Fieldlog", statusBarStyle: "default" },
};
```

# Installability criteria (what makes the install prompt appear)

A browser offers "install" only when the app meets the baseline:

- A manifest with `name`/`short_name`, a `start_url`, `display: "standalone"` (or `fullscreen`/
  `minimal-ui`), and at least a 192px **and** a 512px icon.
- Served over HTTPS (the edge platform already does this).
- A registered service worker **with a `fetch` handler** — required for installability on some
  engines. If you are on the manifest-only path (installability without offline), provide a minimal
  SW whose `fetch` handler is pure passthrough (`return`), so you meet the criterion without taking
  on caching.
- A maskable icon is not strictly required but prevents an ugly letterboxed icon on Android.

# The installability-only path (no offline)

When the user wants the installed-app feel but is reliably online, ship the manifest and a
**passthrough** service worker — no caches, no offline logic, nothing to go stale:

```js
// public/sw.js — installability-only. No caching, so nothing to invalidate.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {}); // present (installability) but does nothing
```

This is the honest minimum: you get add-to-home-screen and a standalone window without inheriting the
cache-coherence burden. If genuine offline is later needed, graduate to
`references/service-worker-and-cache.md`. Record either way in `DECISIONS.md`.
