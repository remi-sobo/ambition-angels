import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Deterministic follow-up coverage (Phase 3). The guarantee is a query, not an
 * AI watching: a past meeting is covered if it has a linked follow-up task OR is
 * explicitly marked none_needed/dismissed/has_follow_up. Everything else is a gap.
 * Same shape as the Executive Briefing's other exception lists — never hallucinates.
 *
 * Service-role caller: org_id MUST be passed and filtered (the house trap), or it
 * scans every tenant.
 */

export const COVERAGE_WINDOW_DAYS = 14;

export async function meetingFollowUpGaps(
  sb: SupabaseClient,
  orgId: string,
  now: Date,
  windowDays: number = COVERAGE_WINDOW_DAYS
): Promise<{ gapCount: number; total: number; windowDays: number }> {
  const since = new Date(now.getTime() - windowDays * 86_400_000).toISOString();

  const { data: meetings } = await sb
    .from("meeting_records")
    .select("id, follow_up_status")
    .eq("org_id", orgId)
    .gte("occurred_at", since)
    .lte("occurred_at", now.toISOString());
  const rows = (meetings ?? []) as Array<{ id: string; follow_up_status: string }>;
  if (rows.length === 0) return { gapCount: 0, total: 0, windowDays };

  const ids = rows.map((r) => r.id);
  const { data: linked } = await sb
    .from("ops_tasks")
    .select("meeting_record_id")
    .eq("org_id", orgId)
    .in("meeting_record_id", ids);
  const hasTask = new Set(
    ((linked ?? []) as Array<{ meeting_record_id: string | null }>)
      .map((t) => t.meeting_record_id)
      .filter((x): x is string => !!x)
  );

  const gapCount = rows.filter(
    (r) => r.follow_up_status === "needs_follow_up" && !hasTask.has(r.id)
  ).length;

  return { gapCount, total: rows.length, windowDays };
}
