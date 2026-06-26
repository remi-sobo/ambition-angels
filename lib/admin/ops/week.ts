/**
 * Shared week-anchor math for the Monday Plan / Friday Review rhythm.
 *
 * The planning week is anchored on Monday in America/Los_Angeles — the same zone
 * the Agenda layer (lib/agenda/service.ts:36) and the `planned_week` backfill use.
 * Doing the math in LA rather than server-UTC keeps the week from rolling forward
 * on Sunday afternoon Pacific, when UTC has already crossed into Monday.
 *
 * `ops_tasks.planned_week` is a `date` column, so the week anchor is a YYYY-MM-DD
 * string. For the rare timestamptz comparison (e.g. "completed since this Monday")
 * use dayStartInstant(), which resolves LA-midnight to a UTC instant.
 */

export const ORG_TZ = "America/Los_Angeles";

/** Today as YYYY-MM-DD in the org timezone. */
export function todayInTZ(tz: string = ORG_TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Add `days` to a YYYY-MM-DD string, returning YYYY-MM-DD. UTC-based, so no DST drift. */
export function addDays(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Monday (YYYY-MM-DD) of the LA week containing `dateISO` (defaults to today in LA). */
export function mondayOf(dateISO: string = todayInTZ()): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun .. 6=Sat
  return addDays(dateISO, -((dow + 6) % 7)); // days back to Monday
}

/** Monday of the current LA week, as YYYY-MM-DD. The source of truth for "this week." */
export function thisMonday(): string {
  return mondayOf();
}

/** Monday of next LA week. */
export function nextMonday(): string {
  return addDays(thisMonday(), 7);
}

/** Monday of last LA week. */
export function lastMonday(): string {
  return addDays(thisMonday(), -7);
}

/** Day-of-week for a YYYY-MM-DD date in LA: 0=Sun … 6=Sat. UTC-based, no DST drift. */
export function weekdayIndex(dateISO: string = todayInTZ()): number {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** "Month D, YYYY" header for a Monday date string. */
export function formatWeekHeader(mondayISO: string): string {
  return new Date(mondayISO + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** The seven YYYY-MM-DD days of the week starting at `mondayISO` (Mon → Sun). */
export function weekDays(mondayISO: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(mondayISO, i));
}

/** "Mon · Jun 22" style label for a day-block header. */
export function formatDayLabel(dayISO: string): string {
  const d = new Date(dayISO + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** The LA calendar date (YYYY-MM-DD) an instant falls on — for bucketing agenda events by day. */
export function laDateOf(instant: string | Date, tz: string = ORG_TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
}

/**
 * UTC instant (ISO) for 00:00 local time in `tz` on the given date — for comparing
 * against timestamptz columns like `completed_at`. Resolves the LA↔UTC offset for
 * that specific date (so it's correct across the PST/PDT boundary).
 */
export function dayStartInstant(dateISO: string, tz: string = ORG_TZ): string {
  const probe = new Date(dateISO + "T00:00:00Z");
  const asUTC = new Date(probe.toLocaleString("en-US", { timeZone: "UTC" }));
  const asTZ = new Date(probe.toLocaleString("en-US", { timeZone: tz }));
  const offsetMs = asTZ.getTime() - asUTC.getTime(); // tz east of UTC (LA: negative)
  return new Date(probe.getTime() - offsetMs).toISOString();
}
