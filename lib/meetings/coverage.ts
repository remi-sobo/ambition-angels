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
    .select("id, follow_up_status, calendar_event_id")
    .eq("org_id", orgId)
    .gte("occurred_at", since)
    .lte("occurred_at", now.toISOString());
  const rows = (meetings ?? []) as Array<{
    id: string;
    follow_up_status: string;
    calendar_event_id: string | null;
  }>;
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

  // One meeting, one count. A calendar shared with a second connected user
  // mirrors its events per owner (calendar_events is keyed on owner +
  // google_event_id), so the same meeting can carry a record per owner. Group
  // on the shared Google event; a group is a gap only if no copy is covered.
  const eventIds = Array.from(
    new Set(rows.map((r) => r.calendar_event_id).filter((x): x is string => !!x))
  );
  const googleId = new Map<string, string>();
  if (eventIds.length) {
    const { data: evs } = await sb
      .from("calendar_events")
      .select("id, google_event_id")
      .eq("org_id", orgId)
      .in("id", eventIds);
    for (const e of (evs ?? []) as Array<{ id: string; google_event_id: string | null }>) {
      if (e.google_event_id) googleId.set(e.id, e.google_event_id);
    }
  }

  const covered = new Map<string, boolean>();
  for (const r of rows) {
    const key =
      (r.calendar_event_id ? googleId.get(r.calendar_event_id) : null) ?? `record:${r.id}`;
    const isGap = r.follow_up_status === "needs_follow_up" && !hasTask.has(r.id);
    covered.set(key, (covered.get(key) ?? false) || !isGap);
  }

  const gapCount = Array.from(covered.values()).filter((c) => !c).length;

  return { gapCount, total: covered.size, windowDays };
}
