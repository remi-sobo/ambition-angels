import type { AgendaItem } from "@/lib/agenda/service";
import type { CalendarPrefs } from "@/lib/agenda/prefs";
import type { GridBlock, GridEvent } from "@/lib/agenda/week-grid";
import { computeWeekSummary, type WeekSummary } from "@/lib/agenda/week-summary";
import { dayStartInstant, laDateOf, weekdayIndex } from "@/lib/admin/ops/week";

/**
 * Which agenda items count as the owner's own meetings (Weekly Plan v2,
 * PR 1). getAgenda() returns every calendar RLS lets the viewer read: their
 * own, any delegated to them, and their direct reports'. A week read must
 * keep only the viewed owner's events, or a manager's status line counts a
 * report's meetings as their own.
 *
 * Pure, so the week grid and the rhythm status line share one rule and it is
 * unit-tested (tests/own-events.test.ts).
 *
 * - Owner match: the event's owner_user_id is the viewed owner.
 * - Bookings (/meet) carry no owner: they belong on the viewer's own week,
 *   never superimposed on someone else's.
 * - source='bloomos' rows are mirrors of work blocks; blocks are counted from
 *   work_blocks, so the mirror is never a meeting.
 */
export function isOwnMeeting(
  item: Pick<AgendaItem, "ownerUserId" | "source">,
  ownerUserId: string,
  isSelf: boolean
): boolean {
  if (item.source === "bloomos") return false;
  return item.ownerUserId === ownerUserId || (item.ownerUserId === null && isSelf);
}

/** Minutes from the day's org-TZ midnight for an instant, clamped to 0..1440. */
export function minutesInto(dayISO: string, instantISO: string): number {
  const midnight = Date.parse(dayStartInstant(dayISO));
  return Math.max(0, Math.min(1440, Math.round((Date.parse(instantISO) - midnight) / 60_000)));
}

/** Mon..Fri are working days; weekends never count toward open time. */
export function isWorkday(dayISO: string): boolean {
  const dow = weekdayIndex(dayISO);
  return dow >= 1 && dow <= 5;
}

/**
 * Project a week's agenda onto the owner's grid days, in org-TZ minutes.
 * Keeps only the owner's own meetings (isOwnMeeting). A timed event with no
 * end reads as 30 minutes; zero-length events drop out.
 */
export function projectOwnEvents(
  items: AgendaItem[],
  args: { ownerUserId: string; isSelf: boolean; days: string[] }
): { timed: GridEvent[]; allDay: GridEvent[] } {
  const daySet = new Set(args.days);
  const timed: GridEvent[] = [];
  const allDay: GridEvent[] = [];
  for (const item of items) {
    if (!isOwnMeeting(item, args.ownerUserId, args.isSelf)) continue;
    const day = item.allDay ? item.start.slice(0, 10) : laDateOf(item.start);
    if (!daySet.has(day)) continue;
    const ev: GridEvent = {
      id: item.id,
      day,
      startMin: item.allDay ? 0 : minutesInto(day, item.start),
      endMin: item.allDay
        ? 1440
        : item.end
          ? minutesInto(day, item.end)
          : minutesInto(day, item.start) + 30,
      title: item.title,
      location: item.location,
      isExternal: item.isExternal,
      allDay: item.allDay,
      source: item.source,
    };
    if (ev.allDay) allDay.push(ev);
    else if (ev.endMin > ev.startMin) timed.push(ev);
  }
  return { timed, allDay };
}

/**
 * The one week time-accounting call (Weekly Plan v2, PR 1): the grid's
 * summary strip and the rhythm status line both come through here, so the
 * same owner and week always read the same meeting and open minutes.
 */
export function summarizeOwnWeek(args: {
  days: string[];
  timed: Array<Pick<GridEvent, "day" | "startMin" | "endMin">>;
  blocks: Array<Pick<GridBlock, "day" | "startMin" | "endMin">>;
  prefs: Pick<CalendarPrefs, "dayStartMinute" | "dayEndMinute">;
  blockTasksTotal: number;
  blockTasksDone: number;
}): WeekSummary {
  return computeWeekSummary({
    days: args.days.map((day) => ({
      meetings: args.timed
        .filter((e) => e.day === day)
        .map((e) => ({ startMin: e.startMin, endMin: e.endMin })),
      blocks: args.blocks
        .filter((b) => b.day === day)
        .map((b) => ({ startMin: b.startMin, endMin: b.endMin })),
      workday: isWorkday(day),
    })),
    workStartMin: args.prefs.dayStartMinute,
    workEndMin: args.prefs.dayEndMinute,
    blockTasksTotal: args.blockTasksTotal,
    blockTasksDone: args.blockTasksDone,
  });
}
