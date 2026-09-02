/**
 * Deterministic week time accounting (Calendar & Time Blocking, Phase 5;
 * consumed early by the grid's summary strip). Pure and minute-based so the
 * grid strip and the Friday verdict compute the same numbers from the same
 * rows — no AI, no separate store. Unit-tested in tests/week-summary.test.ts.
 */

export type MinuteInterval = { startMin: number; endMin: number };

export type WeekSummaryInput = {
  /** Per day (Mon..Sun): timed meetings and work blocks, minutes from midnight. */
  days: Array<{ meetings: MinuteInterval[]; blocks: MinuteInterval[] }>;
  workStartMin: number;
  workEndMin: number;
  blockTasksTotal: number;
  blockTasksDone: number;
};

export type WeekSummary = {
  meetingMin: number;
  blockedMin: number;
  /** Free working-hours minutes not covered by a meeting or a block. */
  openMin: number;
  blockTasksTotal: number;
  blockTasksDone: number;
};

function mergeIntervals(items: MinuteInterval[]): MinuteInterval[] {
  const sorted = items
    .filter((i) => i.endMin > i.startMin)
    .sort((a, b) => a.startMin - b.startMin);
  const merged: MinuteInterval[] = [];
  for (const i of sorted) {
    const last = merged[merged.length - 1];
    if (last && i.startMin <= last.endMin) {
      last.endMin = Math.max(last.endMin, i.endMin);
    } else {
      merged.push({ ...i });
    }
  }
  return merged;
}

function totalMin(items: MinuteInterval[]): number {
  return items.reduce((sum, i) => sum + (i.endMin - i.startMin), 0);
}

function clip(items: MinuteInterval[], lo: number, hi: number): MinuteInterval[] {
  return items
    .map((i) => ({ startMin: Math.max(i.startMin, lo), endMin: Math.min(i.endMin, hi) }))
    .filter((i) => i.endMin > i.startMin);
}

/**
 * Meeting/blocked totals count real durations (overlaps merged per bucket so a
 * double-booked hour is one hour). Open time is working hours minus everything
 * busy, per day, summed across the week.
 */
export function computeWeekSummary(input: WeekSummaryInput): WeekSummary {
  let meetingMin = 0;
  let blockedMin = 0;
  let busyInWorkMin = 0;

  const workLen = Math.max(0, input.workEndMin - input.workStartMin);

  for (const day of input.days) {
    meetingMin += totalMin(mergeIntervals(day.meetings));
    blockedMin += totalMin(mergeIntervals(day.blocks));
    const busy = mergeIntervals(
      clip([...day.meetings, ...day.blocks], input.workStartMin, input.workEndMin)
    );
    busyInWorkMin += totalMin(busy);
  }

  const openMin = Math.max(0, workLen * input.days.length - busyInWorkMin);

  return {
    meetingMin,
    blockedMin,
    openMin,
    blockTasksTotal: input.blockTasksTotal,
    blockTasksDone: input.blockTasksDone,
  };
}

/** "11h 30m" style label for a summary figure. */
export function formatHours(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
