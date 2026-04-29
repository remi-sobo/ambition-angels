import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const getSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

// Click / interaction events. Always returns success — silent failure on
// any error so analytics can never break the page.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: true });
    }

    const {
      event_name,
      page = null,
      session_id = null,
      metadata = null,
    } = body as Record<string, unknown>;

    if (typeof event_name !== "string" || !event_name) {
      return NextResponse.json({ success: true });
    }
    // Skip events fired from admin or api paths
    if (typeof page === "string" && (page.startsWith("/admin") || page.startsWith("/api"))) {
      return NextResponse.json({ success: true });
    }

    const supabase = getSupabase();
    await supabase.from("click_events").insert({
      event_name,
      page: typeof page === "string" ? page : null,
      session_id: typeof session_id === "string" ? session_id : null,
      metadata: metadata && typeof metadata === "object" ? metadata : null,
    });
  } catch (err) {
    console.error("event error:", err);
  }
  return NextResponse.json({ success: true });
}
