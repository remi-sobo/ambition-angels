/* BloomOS admin service worker: installability plus a static-asset cache.
 *
 * Privacy rule (v4 phase 0 audit, finding 8): this worker NEVER stores an
 * authenticated response. Admin pages carry donor and minors' data, and an
 * installed PWA is often a shared phone or front-desk tablet. So:
 *   1. /admin navigations go network-first with NO cache write. Offline,
 *      the worker answers with one generic offline page (inline below, no
 *      user data) instead of a stale copy of someone's page.
 *   2. /api, RSC payloads and anything else dynamic are never touched.
 *   3. Only immutable build assets (/_next/static: JS, CSS, next/font
 *      files) and the static icons under /admin/ are cached, cache-first.
 *   4. Logout and org switch clear every cache this worker owns (client
 *      side via lib/admin/swCache.ts, plus a Clear-Site-Data header).
 *
 * Scope is set to "/admin/" at registration time (see AdminPWA.tsx).
 */

// v10: stop caching authenticated pages. The bump makes activate delete v9,
// which held every admin page a device had ever opened.
const CACHE = "bloomos-admin-v10";

// Static files under /admin/ that are safe to keep: images and fonts only.
// The manifest and everything else dynamic stay network-only.
const STATIC_EXT = /\.(png|jpe?g|svg|ico|webp|woff2?)$/i;

const OFFLINE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>Offline · BloomOS</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:#1C1814;color:#FAFAF8;font:16px/1.5 system-ui,-apple-system,sans-serif;padding:24px;box-sizing:border-box}
  main{max-width:360px;text-align:center}
  h1{font-size:20px;margin:0 0 8px}
  p{margin:0 0 20px;color:#C8C6BE}
  button{background:#E8500A;color:#fff;border:0;border-radius:999px;padding:10px 20px;font:inherit;font-weight:600}
</style></head>
<body><main>
  <h1>You are offline</h1>
  <p>BloomOS could not load this page and nothing was saved. Reconnect and try again.</p>
  <button type="button" onclick="location.reload()">Try again</button>
</main></body></html>`;

function offlineResponse() {
  return new Response(OFFLINE_HTML, {
    status: 503,
    statusText: "Offline",
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

self.addEventListener("install", () => {
  // Nothing to precache: the offline page is inline, and build assets are
  // cached on first use. NOTE: intentionally NOT calling self.skipWaiting()
  // here. A freshly installed SW stays in "waiting" until the user accepts
  // the update via the "A new version is ready" prompt (see AdminPWA.tsx),
  // which posts a SKIP_WAITING message.
});

self.addEventListener("message", (event) => {
  const type = event.data && event.data.type;
  // The update prompt asks the waiting worker to take over on demand.
  if (type === "SKIP_WAITING") self.skipWaiting();
  // Logout / org switch: drop everything this worker has stored.
  if (type === "CLEAR_CACHES") {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
    );
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

  // Never touch API responses: admin data is always live and never stored.
  if (url.pathname.startsWith("/api/")) return;

  // /admin navigations: network only. No cache write, ever.
  if (req.mode === "navigate" && url.pathname.startsWith("/admin")) {
    event.respondWith(fetch(req).catch(() => offlineResponse()));
    return;
  }

  // Immutable build assets and static icons/fonts: cache-first. RSC payload
  // fetches (`RSC: 1` header) are dynamic and fall through untouched.
  const isBuildAsset = url.pathname.startsWith("/_next/static/");
  const isAdminStatic = url.pathname.startsWith("/admin/") && STATIC_EXT.test(url.pathname);
  if ((isBuildAsset || isAdminStatic) && !req.headers.get("RSC")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        const fresh = await fetch(req);
        // Only successful same-origin responses: caching a 404 here would
        // pin a broken asset until the version bumps.
        if (fresh.ok && fresh.type === "basic") {
          const cache = await caches.open(CACHE);
          cache.put(req, fresh.clone()).catch(() => undefined);
        }
        return fresh;
      })()
    );
  }
});
