import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Per-user calendar preferences (calendar_prefs) — working hours + default
 * block length feeding the week grid extent and the open-block computation.
 *
 * Reads run on the service-role client because the grid also needs the VIEWED
 * owner's hours (a manager looking at a report's week), and the table's RLS is
 * deliberately self-only. Every caller must have already asserted the viewer
 * may see that owner (the page's visible-owner resolution does).
 */

export type CalendarPrefs = {
  dayStartMinute: number;
  dayEndMinute: number;
  defaultBlockMinute: number;
};

export const DEFAULT_CALENDAR_PREFS: CalendarPrefs = {
  dayStartMinute: 9 * 60,
  dayEndMinute: 17 * 60,
  defaultBlockMinute: 60,
};

export async function getCalendarPrefs(userId: string): Promise<CalendarPrefs> {
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("calendar_prefs")
    .select("day_start_minute, day_end_minute, default_block_minute")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return DEFAULT_CALENDAR_PREFS;
  const row = data as {
    day_start_minute: number;
    day_end_minute: number;
    default_block_minute: number;
  };
  return {
    dayStartMinute: row.day_start_minute,
    dayEndMinute: row.day_end_minute,
    defaultBlockMinute: row.default_block_minute,
  };
}
