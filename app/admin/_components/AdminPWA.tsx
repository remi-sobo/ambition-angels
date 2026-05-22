"use client";

import { useEffect } from "react";

/**
 * Registers the /admin service worker on mount so the admin app is
 * installable as a PWA. Scope is pinned to "/admin/" so the SW does not
 * intercept marketing-site fetches.
 *
 * Rendered once by app/admin/layout.tsx — no UI.
 */
export default function AdminPWA() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register("/admin-sw.js", { scope: "/admin/" })
        .catch(() => {
          // Registration failures are non-fatal — the admin app still
          // works as a regular website. Swallow to avoid noisy consoles
          // in dev / on unsupported browsers.
        });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
