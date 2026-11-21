import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ensureMeetingRecordsForOwner } from "@/lib/meetings/match";
import { requirePermission } from "@/lib/admin/requirePermission";

// POST /api/admin/meetings/sync — ensure meeting_records exist for the viewer's
// past external calendar events, then match attendees and fan out to timelines.
// Idempotent; safe to call on every visit to the Meetings page.
export async function POST() {
  const guard = await requirePermission("ops.write");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const ctx = guard.ctx;

  const sb = getSupabaseAdmin();
  try {
    const res = await ensureMeetingRecordsForOwner(sb, ctx.orgId, ctx.userId, new Date());
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    console.error("[meetings/sync] failed:", e);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
