import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { addDays, addMinutes } from "date-fns";
import { getFreeBusy, type BusyBlock } from "./google/calendar";
import { getSupabaseAdmin } from "./supabase/admin";
import type { MeetingType } from "./database.types";

/**
 * Timezone the host's available_start_time / available_end_time are
 * interpreted in. Hard-coded to America/Los_Angeles for Phase 1. When Phase
 * 3 adds Shannon/Demetric as hosts in possibly different zones, this moves
 * to a per-meeting_type column.
 */
export const HOST_TIMEZONE = "America/Los_Angeles";

export type AvailableSlot = {
  start: Date;                        // UTC
  end: Date;                          // UTC
};

export type GetAvailableSlotsParams = {
  meetingType: MeetingType;
  /** Calendar day to query. Year-month-day in HOST_TIMEZONE; time ignored. */
  date: Date;
  /** Attendee's IANA tz. Reserved for future per-tz logic; not used today. */
  attendeeTimezone: string;
};

/**
 * Computes bookable slots for a meeting type on a single host-tz calendar
 * date. Returns slots in UTC; the API caller converts for display.
 *
 * Returns [] when:
 *  - the date is fully in the past
 *  - it falls outside max_advance_days
 *  - its weekday is not in available_days
 *  - a matching blackout covers the date
 *  - daily_limit is set and already reached for the day
 *  - the available window is entirely before the min_notice boundary
 *  - every duration-aligned slot overlaps a (buffer-padded) busy block
 *
 * Slots are anchored to the window's start (e.g. 9:00, 9:30, 10:00 for a
 * 30-min meeting in a 9-17 window). The min_notice filter removes early
 * slots from this fixed grid; it does not shift the grid.
 */
export async function getAvailableSlots(
  params: GetAvailableSlotsParams
): Promise<AvailableSlot[]> {
  const { meetingType, date } = params;
  const now = new Date();

  const dateStr = formatInTimeZone(date, HOST_TIMEZONE, "yyyy-MM-dd");
  const dayStartUtc = fromZonedTime(`${dateStr}T00:00:00`, HOST_TIMEZONE);
  const dayEndUtc = fromZonedTime(`${dateStr}T23:59:59.999`, HOST_TIMEZONE);

  if (dayEndUtc.getTime() < now.getTime()) return [];

  const maxAdvance = addDays(now, meetingType.max_advance_days);
  if (dayStartUtc.getTime() > maxAdvance.getTime()) return [];

  if (!meetingType.available_days.includes(isoWeekdayInTz(date, HOST_TIMEZONE))) {
    return [];
  }

  if (await isBlackedOut(meetingType.id, dateStr)) return [];

  if (meetingType.daily_limit != null) {
    const used = await countConfirmedBookingsOnDay(
      meetingType.id, dayStartUtc, dayEndUtc
    );
    if (used >= meetingType.daily_limit) return [];
  }

  const windowStart = fromZonedTime(
    `${dateStr}T${normalizeTime(meetingType.available_start_time)}`,
    HOST_TIMEZONE
  );
  const windowEnd = fromZonedTime(
    `${dateStr}T${normalizeTime(meetingType.available_end_time)}`,
    HOST_TIMEZONE
  );

  const minNoticeBoundary = addMinutes(now, meetingType.min_notice_hours * 60);
  if (windowEnd.getTime() <= minNoticeBoundary.getTime()) return [];

  const [calendarBusy, dbBusy] = await Promise.all([
    getFreeBusy(windowStart, windowEnd),
    fetchConfirmedBookingsAsBusy(windowStart, windowEnd),
  ]);
  const busy = mergeBusy([...calendarBusy, ...dbBusy], meetingType.buffer_minutes);

  return sliceSlots({
    windowStart,
    windowEnd,
    effectiveStart: minNoticeBoundary,
    durationMinutes: meetingType.duration_minutes,
    busy,
  });
}

// ── Pure helpers (covered by unit tests) ─────────────────────────────────

export function isoWeekdayInTz(date: Date, tz: string): number {
  const local = toZonedTime(date, tz);
  const jsDay = local.getDay();        // 0 = Sun … 6 = Sat
  return jsDay === 0 ? 7 : jsDay;      // → 1 = Mon … 7 = Sun (ISO)
}

/** Postgres `time` returns 'HH:MM:SS' or 'HH:MM'; both work after this. */
function normalizeTime(t: string): string {
  return t.length === 5 ? `${t}:00` : t;
}

/**
 * Pads each busy block by `bufferMinutes` on both sides, then merges
 * overlapping/adjacent blocks. The merge avoids redundant overlap checks
 * downstream when busy blocks cluster.
 */
export function mergeBusy(
  blocks: BusyBlock[],
  bufferMinutes: number
): BusyBlock[] {
  if (blocks.length === 0) return [];
  const padded = blocks
    .map((b) => ({
      start: addMinutes(b.start, -bufferMinutes),
      end: addMinutes(b.end, bufferMinutes),
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: BusyBlock[] = [padded[0]];
  for (let i = 1; i < padded.length; i++) {
    const last = merged[merged.length - 1];
    const cur = padded[i];
    if (cur.start.getTime() <= last.end.getTime()) {
      if (cur.end.getTime() > last.end.getTime()) last.end = cur.end;
    } else {
      merged.push(cur);
    }
  }
  return merged;
}

/**
 * Generates duration-aligned slots inside [windowStart, windowEnd), drops
 * any that start before effectiveStart, and drops any that overlap a busy
 * block. Pure — no I/O.
 */
export function sliceSlots(args: {
  windowStart: Date;
  windowEnd: Date;
  effectiveStart: Date;
  durationMinutes: number;
  busy: BusyBlock[];
}): AvailableSlot[] {
  const { windowStart, windowEnd, effectiveStart, durationMinutes, busy } = args;
  const slots: AvailableSlot[] = [];
  let cursor = windowStart;
  while (true) {
    const slotEnd = addMinutes(cursor, durationMinutes);
    if (slotEnd.getTime() > windowEnd.getTime()) break;
    if (cursor.getTime() >= effectiveStart.getTime()) {
      const overlaps = busy.some(
        (b) =>
          cursor.getTime() < b.end.getTime() &&
          slotEnd.getTime() > b.start.getTime()
      );
      if (!overlaps) {
        slots.push({ start: new Date(cursor), end: new Date(slotEnd) });
      }
    }
    cursor = addMinutes(cursor, durationMinutes);
  }
  return slots;
}

// ── Supabase I/O helpers ─────────────────────────────────────────────────

async function isBlackedOut(meetingTypeId: string, dateStr: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("blackouts")
    .select("meeting_type_ids")
    .lte("start_date", dateStr)
    .gte("end_date", dateStr);
  if (!data?.length) return false;
  return data.some(
    (b: { meeting_type_ids: string[] | null }) =>
      b.meeting_type_ids === null || b.meeting_type_ids.includes(meetingTypeId)
  );
}

async function countConfirmedBookingsOnDay(
  meetingTypeId: string,
  dayStartUtc: Date,
  dayEndUtc: Date
): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { count } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("meeting_type_id", meetingTypeId)
    .eq("status", "confirmed")
    .gte("start_time", dayStartUtc.toISOString())
    .lt("start_time", dayEndUtc.toISOString());
  return count ?? 0;
}

/**
 * Defense-in-depth backup for getFreeBusy in case Google's freebusy lags
 * behind a booking we just inserted. Returns confirmed-booking ranges that
 * overlap [windowStart, windowEnd), across all meeting types (same host =
 * one calendar).
 */
async function fetchConfirmedBookingsAsBusy(
  windowStart: Date,
  windowEnd: Date
): Promise<BusyBlock[]> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("bookings")
    .select("start_time, end_time")
    .eq("status", "confirmed")
    .lt("start_time", windowEnd.toISOString())
    .gt("end_time", windowStart.toISOString());
  return (data ?? []).map(
    (b: { start_time: string; end_time: string }) => ({
      start: new Date(b.start_time),
      end: new Date(b.end_time),
    })
  );
}
