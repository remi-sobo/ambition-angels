import type { OpenBlock } from "@/lib/admin/ops/open-blocks";

/**
 * The Plan capacity read (Weekly Plan v2, PR 2): estimated work this week vs
 * the open time left to do it in. Pure; tests/capacity.test.ts.
 *
 * Open time counts from now forward: past days are gone and today counts only
 * the open minutes still ahead. Committed time is the sum of estimates for
 * this week's open tasks, with two rules:
 *
 *   - No estimate: count the user's default block length, and say how many
 *     tasks that applied to, so the meter never looks more certain than it is.
 *   - Already time-blocked: skip it. Its block is already busy time, so it has
 *     already come out of the open figure; counting its estimate too would
 *     charge the same work twice.
 */

export type CapacityDay = { iso: string; openBlocks: OpenBlock[] };

export type CapacityTask = {
  estimated_minutes: number | null;
  /** On a calendar block (task block or work block) this week. */
  timeBlocked: boolean;
};

export type WeekCapacity = {
  openMin: number;
  committedMin: number;
  /** Tasks counted in committedMin. */
  countedTasks: number;
  /** Of those, how many had no estimate and ran on the default. */
  defaultedTasks: number;
  /** Tasks left out because their block is already in the open figure. */
  timeBlockedTasks: number;
  /** committedMin - openMin when positive, else 0. */
  overMin: number;
};

export function computeWeekCapacity(args: {
  days: CapacityDay[];
  todayISO: string;
  /** Minutes since local midnight right now (org TZ). */
  nowMinute: number;
  tasks: CapacityTask[];
  defaultBlockMinute: number;
}): WeekCapacity {
  let openMin = 0;
  for (const day of args.days) {
    if (day.iso < args.todayISO) continue;
    for (const b of day.openBlocks) {
      const start = day.iso === args.todayISO ? Math.max(b.startMinute, args.nowMinute) : b.startMinute;
      if (b.endMinute > start) openMin += b.endMinute - start;
    }
  }

  let committedMin = 0;
  let countedTasks = 0;
  let defaultedTasks = 0;
  let timeBlockedTasks = 0;
  for (const t of args.tasks) {
    if (t.timeBlocked) {
      timeBlockedTasks += 1;
      continue;
    }
    countedTasks += 1;
    if (t.estimated_minutes == null) {
      defaultedTasks += 1;
      committedMin += args.defaultBlockMinute;
    } else {
      committedMin += t.estimated_minutes;
    }
  }

  return {
    openMin,
    committedMin,
    countedTasks,
    defaultedTasks,
    timeBlockedTasks,
    overMin: Math.max(0, committedMin - openMin),
  };
}
