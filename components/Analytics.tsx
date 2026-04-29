"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackEvent } from "@/lib/analytics";

function detectDevice(): string {
  if (typeof window === "undefined") return "Unknown";
  const w = window.innerWidth;
  if (w < 640) return "Mobile";
  if (w < 1024) return "Tablet";
  return "Desktop";
}

function detectBrowser(): string {
  if (typeof navigator === "undefined") return "Unknown";
  const ua = navigator.userAgent;
  // Order matters — Edge and modern Chromium-based browsers identify as
  // "Chrome" in their UA string. We bucket Edge + others into "Other".
  if (/Edg\//.test(ua) || /OPR\//.test(ua)) return "Other";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return "Other";
}

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = sessionStorage.getItem("aa_session");
    if (existing) return existing;
    const fresh =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem("aa_session", fresh);
    return fresh;
  } catch {
    return "";
  }
}

/**
 * Self-hosted page-view tracker. Fires once per route change and again on
 * unmount with the duration spent on the page. Skips /admin and /api.
 * Wrapped in try/catch — analytics must never break the page.
 */
export default function Analytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!pathname) return;
    if (pathname.startsWith("/admin") || pathname.startsWith("/api")) return;

    const startedAt = Date.now();
    const session_id = getOrCreateSessionId();
    const referrer =
      typeof document !== "undefined" ? document.referrer || "" : "";
    const device = detectDevice();
    const browser = detectBrowser();

    const basePayload = { page: pathname, referrer, device, browser, session_id };

    // ── Mount: fire pageview (no duration yet) ──
    try {
      void fetch("/api/analytics/pageview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(basePayload),
        keepalive: true,
      }).catch(() => {});
    } catch {
      // silent
    }

    // ── Global app-store click listener ──
    // Captures any iOS/Android download link click on the current page,
    // regardless of how the link is authored. Single source of truth for
    // app_download_ios / app_download_android events site-wide.
    const onAppStoreClick = (e: MouseEvent) => {
      try {
        const link = (e.target as Element | null)?.closest?.("a");
        if (!link) return;
        const href = link.getAttribute("href") || "";
        if (href.includes("apps.apple.com") && /ambition-shape-your-future/.test(href)) {
          trackEvent("app_download_ios");
        } else if (
          href.includes("play.google.com") &&
          /theambitionapp\.ambitionappRN/.test(href)
        ) {
          trackEvent("app_download_android");
        }
      } catch {
        // silent
      }
    };
    document.addEventListener("click", onAppStoreClick, true);

    // ── Unmount: send duration via sendBeacon ──
    return () => {
      document.removeEventListener("click", onAppStoreClick, true);
      try {
        const duration_seconds = Math.max(
          0,
          Math.round((Date.now() - startedAt) / 1000)
        );
        const exitPayload = JSON.stringify({ ...basePayload, duration_seconds });
        if (typeof navigator !== "undefined" && navigator.sendBeacon) {
          const blob = new Blob([exitPayload], { type: "application/json" });
          navigator.sendBeacon("/api/analytics/pageview", blob);
        } else {
          // Fallback: best-effort fetch with keepalive
          void fetch("/api/analytics/pageview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: exitPayload,
            keepalive: true,
          }).catch(() => {});
        }
      } catch {
        // silent
      }
    };
  }, [pathname]);

  return null;
}
