/* AA Admin service worker — minimal install-target SW.
 *
 * Goals:
 *   1. Satisfy installability requirements (Android/Chrome wants a
 *      registered SW with a fetch handler before showing the install
 *      prompt).
 *   2. Network-first for /admin navigations so we never serve a stale
 *      shell; fall back to a cached copy when offline.
 *   3. Stay out of the way for API and webhook routes — those must
 *      always hit the network.
 *
 * Scope is set to "/admin/" at registration time (see AdminPWA.tsx).
 */

const CACHE = "aa-admin-v8";
const CORE = ["/admin"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(CORE))
      .catch(() => undefined)
  );
  // NOTE: intentionally NOT calling self.skipWaiting() here. A freshly
  // installed SW stays in "waiting" until the user accepts the update via
  // the "A new version is ready" prompt (see AdminPWA.tsx), which posts a
  // SKIP_WAITING message. This avoids swapping the app out from under an
  // active session.
});

// The update prompt asks the waiting worker to take over on demand.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API responses — admin data is always live.
  if (url.pathname.startsWith("/api/")) return;

  // Navigation requests inside /admin: network-first with cache fallback.
  if (req.mode === "navigate" && url.pathname.startsWith("/admin")) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE);
          cache.put(req, fresh.clone()).catch(() => undefined);
          return fresh;
        } catch {
          const cached = await caches.match(req);
          if (cached) return cached;
          const shell = await caches.match("/admin");
          if (shell) return shell;
          return new Response("Offline", { status: 503, statusText: "Offline" });
        }
      })()
    );
    return;
  }

  // Static assets under /admin/ (icons, manifest): cache-first.
  //
  // Guarded by destination: Next's RSC data fetches (router.refresh(), soft
  // navigations) are same-path GETs with mode !== "navigate", so without the
  // guard they land here and the first response gets pinned — every later
  // router.refresh() on that page then serves a stale tree until reload.
  // Real static assets carry a concrete destination; RSC fetches carry "".
  const STATIC_DESTINATIONS = ["image", "font", "style", "script", "manifest"];
  if (url.pathname.startsWith("/admin/") && STATIC_DESTINATIONS.includes(req.destination)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        try {
          const fresh = await fetch(req);
          // Only cache successful responses — caching a 404/redirect here
          // would pin a broken asset (cache-first) until the SW version
          // bumps. This is what previously stuck a missing logo in place.
          if (fresh && fresh.ok && fresh.type === "basic") {
            const cache = await caches.open(CACHE);
            cache.put(req, fresh.clone()).catch(() => undefined);
          }
          return fresh;
        } catch {
          return new Response("Offline", { status: 503 });
        }
      })()
    );
  }
});
