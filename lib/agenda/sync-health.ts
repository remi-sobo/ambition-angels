import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SyncHealth } from "@/lib/agenda/sync-freshness";

/**
 * The viewer's calendar sync health for the stale-sync banner. Two indexed
 * reads, both org- and owner-scoped (service-role client, so the org fence is
 * explicit). The newest job WITH a finished_at is the one that counts: a
 * stuck `running` row has none and must not mask a stale calendar.
 */
export async function loadCalendarSyncHealth(orgId: string, userId: string): Promise<SyncHealth> {
  const sb = getSupabaseAdmin();
  const [connRes, jobRes] = await Promise.all([
    sb
      .from("connections")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .eq("provider", "google_calendar")
      .eq("status", "active"),
    sb
      .from("calendar_sync_jobs")
      .select("status, finished_at, errors")
      .eq("org_id", orgId)
      .eq("owner_user_id", userId)
      .not("finished_at", "is", null)
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const job = jobRes.data as {
    status: string;
    finished_at: string;
    errors: unknown[] | null;
  } | null;

  return {
    hasCalendar: (connRes.count ?? 0) > 0 || !!job,
    lastFinishedAt: job?.finished_at ?? null,
    lastFailed: !!job && (job.status === "failed" || (Array.isArray(job.errors) && job.errors.length > 0)),
  };
}
