/**
 * On-demand calendar sync (BloomOS Agenda Phase 2). Called when a Today/agenda
 * view loads with a stale cache. Any authed member may trigger it — it only
 * refreshes the cache; who can *read* the synced rows is still governed by
 * calendar_events RLS. Runs as service-role.
 */
import { NextResponse } from "next/server";
import { getOrgContext } from "@/lib/admin/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { runCalendarSync } from "@/lib/agenda/calendar-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const results = await runCalendarSync(getSupabaseAdmin(), new Date());
  return NextResponse.json({
    users: results.length,
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  });
}
