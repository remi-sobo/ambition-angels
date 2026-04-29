/**
 * Fire-and-forget analytics event tracker. Posts to /api/analytics/event
 * with the current page path and the session ID stored in sessionStorage
 * (under "aa_session"). Silent failure — never throws, never blocks.
 */
export function trackEvent(
  eventName: string,
  metadata?: Record<string, unknown>
): void {
  if (typeof window === "undefined") return;
  try {
    const path = window.location.pathname;
    if (path.startsWith("/admin") || path.startsWith("/api")) return;

    let session_id = "";
    try {
      session_id = sessionStorage.getItem("aa_session") ?? "";
    } catch {
      // sessionStorage might be blocked — that's fine, just send empty
    }

    const body = JSON.stringify({
      event_name: eventName,
      page: path,
      session_id,
      metadata: metadata ?? null,
    });

    // Prefer fetch with keepalive (works during page-unload).
    void fetch("/api/analytics/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Swallow — analytics must never break the user experience
  }
}
