import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const getSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

// Page views are written from two places per visit:
//   1. on mount   → no duration_seconds yet
//   2. on unmount → fired via navigator.sendBeacon with duration_seconds set
// Both are inserts, never throw — analytics must never break the user
// experience. We wrap aggressively and always return success: true.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: true });
    }

    const {
      page,
      referrer = null,
      device = null,
      browser = null,
      session_id = null,
      duration_seconds = null,
    } = body as Record<string, unknown>;

    if (typeof page !== "string" || !page) {
      return NextResponse.json({ success: true });
    }
    // Defensive: never write admin/api page views even if a client misroutes
    if (page.startsWith("/admin") || page.startsWith("/api")) {
      return NextResponse.json({ success: true });
    }

    const supabase = getSupabase();
    await supabase.from("page_views").insert({
      page,
      referrer: typeof referrer === "string" ? referrer : null,
      device: typeof device === "string" ? device : null,
      browser: typeof browser === "string" ? browser : null,
      session_id: typeof session_id === "string" ? session_id : null,
      duration_seconds:
        typeof duration_seconds === "number" && Number.isFinite(duration_seconds)
          ? Math.max(0, Math.round(duration_seconds))
          : null,
    });
  } catch (err) {
    // Silent fail — never throw
    console.error("pageview error:", err);
  }
  return NextResponse.json({ success: true });
}
