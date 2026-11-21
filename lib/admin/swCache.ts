/**
 * Clear every cache the admin service worker (public/admin-sw.js) owns.
 *
 * Called on logout, global sign-out, and org switch, so the next person on a
 * shared device (or the same person under another org) can never read what
 * the last session left behind. The worker no longer stores authenticated
 * pages (audit finding 8), but this also wipes older installs and the static
 * cache. The server routes send `Clear-Site-Data: "cache"` as a second layer.
 *
 * Client-only and best effort: it never throws, so a logout never stalls on it.
 */
export async function clearAdminCaches(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_CACHES" });
  } catch {
    // No worker or no controller: the direct sweep below still runs.
  }
  try {
    if (!("caches" in window)) return;
    const keys = await window.caches.keys();
    await Promise.all(keys.map((k) => window.caches.delete(k)));
  } catch {
    // CacheStorage can be unavailable (private mode); nothing to clear then.
  }
}
