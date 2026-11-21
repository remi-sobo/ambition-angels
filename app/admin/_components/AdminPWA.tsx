"use client";

import { useEffect, useState } from "react";
import Alert from "./ui/Alert";

/**
 * Registers the /admin service worker on mount so the admin app is
 * installable as a PWA, and surfaces an "A new version is ready" prompt
 * when a new service worker has been installed and is waiting to take over.
 *
 * The SW (public/admin-sw.js) deliberately does NOT call skipWaiting() on
 * install, so a new deploy sits in the "waiting" state until the user taps
 * Refresh here. Refresh posts SKIP_WAITING to the waiting worker; once it
 * activates, `controllerchange` fires and we reload into the new version.
 *
 * Scope is pinned to "/admin/" so the SW does not intercept marketing-site
 * fetches. Rendered once by app/admin/layout.tsx.
 *
 * Also shows a plain offline banner while navigator.onLine is false: the
 * worker no longer serves cached pages (audit finding 8), so the person needs
 * to know a tap or a save will not reach the server.
 */
export default function AdminPWA() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [reloading, setReloading] = useState(false);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    let reg: ServiceWorkerRegistration | null = null;

    // Track a newly-installed worker. We only prompt when there is already
    // an active controller — otherwise this is a first install, not an update.
    const trackWorker = (sw: ServiceWorker | null) => {
      if (!sw) return;
      const promote = () => {
        if (sw.state === "installed" && navigator.serviceWorker.controller) {
          setWaiting(sw);
        }
      };
      promote();
      sw.addEventListener("statechange", promote);
    };

    const register = async () => {
      try {
        reg = await navigator.serviceWorker.register("/admin-sw.js", {
          scope: "/admin/",
        });

        // A worker may already be waiting from a previous visit.
        if (reg.waiting && navigator.serviceWorker.controller) {
          setWaiting(reg.waiting);
        }

        // A worker mid-install when we register.
        trackWorker(reg.installing);

        // Future updates discovered while the tab is open.
        reg.addEventListener("updatefound", () => {
          trackWorker(reg?.installing ?? null);
        });
      } catch {
        // Registration failures are non-fatal — the admin app still works
        // as a regular website. Swallow to avoid noisy consoles in dev / on
        // unsupported browsers.
      }
    };

    // When the new worker activates, reload so the fresh assets load.
    const onControllerChange = () => {
      if (reloading) return;
      setReloading(true);
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange
    );

    // Re-check for updates when the tab regains focus.
    const onVisible = () => {
      if (document.visibilityState === "visible") reg?.update().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange
      );
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("load", register);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = () => {
    if (!waiting) {
      window.location.reload();
      return;
    }
    setReloading(true);
    waiting.postMessage({ type: "SKIP_WAITING" });
  };

  const offlineBanner = offline ? (
    <div
      className="fixed inset-x-0 top-0 z-[46] flex justify-center px-4"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }}
    >
      <Alert tone="warning" title="You are offline." className="w-full max-w-md shadow-2xl">
        Changes you make now will not be saved. Reconnect to keep working.
      </Alert>
    </div>
  ) : null;

  if (!waiting) return offlineBanner;

  return (
    <>
    {offlineBanner}
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-24 z-[45] flex justify-center px-4 lg:bottom-6"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex w-full max-w-md items-center gap-3 rounded-panel border border-white/10 bg-navy px-4 py-3 text-cream shadow-2xl">
        <span className="flex-1 text-sm font-heading">
          A new version is ready.
        </span>
        <button
          type="button"
          onClick={refresh}
          disabled={reloading}
          className="shrink-0 rounded-full bg-orange px-4 py-1.5 text-sm font-heading font-semibold text-white transition hover:bg-orange-dark disabled:opacity-60"
        >
          {reloading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
    </div>
    </>
  );
}
