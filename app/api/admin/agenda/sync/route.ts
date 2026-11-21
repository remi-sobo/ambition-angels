/**
 * On-demand calendar sync (BloomOS Agenda Phase 2). Called when a Today/agenda
 * view loads with a stale cache, or from Settings after connecting a calendar.
 * Runs as service-role, so it is scoped explicitly: only the CALLER's own
 * calendar connection(s) in the ACTIVE org are synced. The all-org sweep lives
 * only on the cron path (app/api/cron/calendar-sync, behind CRON_SECRET).
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { runCalendarSync } from "@/lib/agenda/calendar-sync";
import { requirePermission } from "@/lib/admin/requirePermission";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const guard = await requirePermission("ops.write");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { userId, orgId } = guard.ctx;
  const results = await runCalendarSync(getSupabaseAdmin(), new Date(), { userId, orgId });
  return NextResponse.json({
    users: results.length,
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  });
}
