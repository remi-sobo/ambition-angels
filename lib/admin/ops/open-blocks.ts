/**
 * Open-block (free/busy gap) computation for the Monday day walk (Operating
 * Rhythm v2, Phase 5). Pure: given a day's busy intervals, return the gaps
 * within working hours where focused work can actually go — "thinking through
 * what goes in each open block is the core planning act."
 *
 * Read-only; ships with the day walk independent of any calendar write-back.
 */

export type Interval = { start: number; end: number }; // epoch ms
export type OpenBlock = { startMinute: number; endMinute: number }; // minutes from local midnight

export type WorkingHours = { startMinute: number; endMinute: number };

/** Fallback when the user has no calendar_prefs row (matches the DB defaults). */
export const DEFAULT_WORKING_HOURS: WorkingHours = {
  startMinute: 9 * 60, // 09:00
  endMinute: 17 * 60, // 17:00
};

const MIN_BLOCK_MIN = 30; // ignore slivers shorter than this

/**
 * @param dayMidnightMs epoch ms of 00:00 *local* time on the day (from
 *   dayStartInstant(dayISO)). Minutes are returned relative to it, matching the
 *   start_minute the block-write route expects.
 * @param busy busy intervals as epoch ms (events + existing task blocks).
 * @param hours per-user working hours (calendar_prefs); defaults to 9–5.
 */
export function computeOpenBlocks(
  dayMidnightMs: number,
  busy: Interval[],
  hours: WorkingHours = DEFAULT_WORKING_HOURS
): OpenBlock[] {
  const workStart = dayMidnightMs + hours.startMinute * 60_000;
  const workEnd = dayMidnightMs + hours.endMinute * 60_000;

  const merged: Interval[] = [];
  const clipped = busy
    .map((b) => ({ start: Math.max(b.start, workStart), end: Math.min(b.end, workEnd) }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start);
  for (const b of clipped) {
    const last = merged[merged.length - 1];
    if (last && b.start <= last.end) last.end = Math.max(last.end, b.end);
    else merged.push({ ...b });
  }

  const blocks: OpenBlock[] = [];
  let cursor = workStart;
  const push = (startMs: number, endMs: number) => {
    if (endMs - startMs >= MIN_BLOCK_MIN * 60_000) {
      blocks.push({
        startMinute: Math.round((startMs - dayMidnightMs) / 60_000),
        endMinute: Math.round((endMs - dayMidnightMs) / 60_000),
      });
    }
  };
  for (const b of merged) {
    push(cursor, b.start);
    cursor = Math.max(cursor, b.end);
  }
  push(cursor, workEnd);
  return blocks;
}
