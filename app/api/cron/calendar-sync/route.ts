/**
 * Cron Google Calendar → calendar_events sync (BloomOS Agenda Phase 2). Auth via
 * Bearer CRON_SECRET (Vercel sets it on cron invocations). Syncs every active
 * google_calendar connection for a window around today. A token lapse or Google
 * outage degrades to a stale cache (logged per user), never a failed response.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { runCalendarSync } from "@/lib/agenda/calendar-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const results = await runCalendarSync(getSupabaseAdmin(), new Date());
  return NextResponse.json({
    users: results.length,
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
