import { describe, expect, test } from "vitest";
import { computeWeekCapacity } from "@/lib/admin/ops/capacity";

const nine2five = [{ startMinute: 9 * 60, endMinute: 17 * 60 }];
const week = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"].map((iso) => ({
  iso,
  openBlocks: nine2five,
}));

describe("computeWeekCapacity", () => {
  test("open time counts from now forward: past days drop, today is clipped", () => {
    // Wednesday 1pm: Wed has 4h left, Thu + Fri 8h each.
    const c = computeWeekCapacity({ days: week, todayISO: "2026-10-14", nowMinute: 13 * 60, tasks: [], defaultBlockMinute: 60 });
    expect(c.openMin).toBe(4 * 60 + 2 * 8 * 60);
  });

  test("before the workday starts, today counts in full", () => {
    const c = computeWeekCapacity({ days: week, todayISO: "2026-10-12", nowMinute: 7 * 60, tasks: [], defaultBlockMinute: 60 });
    expect(c.openMin).toBe(5 * 8 * 60);
  });

  test("unestimated tasks count at the default and are flagged", () => {
    const c = computeWeekCapacity({
      days: week,
      todayISO: "2026-10-12",
      nowMinute: 0,
      tasks: [
        { estimated_minutes: 90, timeBlocked: false },
        { estimated_minutes: null, timeBlocked: false },
        { estimated_minutes: null, timeBlocked: false },
      ],
      defaultBlockMinute: 60,
    });
    expect(c.committedMin).toBe(90 + 60 + 60);
    expect(c.countedTasks).toBe(3);
    expect(c.defaultedTasks).toBe(2);
  });

  test("time-blocked tasks are not charged twice", () => {
    const c = computeWeekCapacity({
      days: week,
      todayISO: "2026-10-12",
      nowMinute: 0,
      tasks: [
        { estimated_minutes: 120, timeBlocked: true },
        { estimated_minutes: 30, timeBlocked: false },
      ],
      defaultBlockMinute: 60,
    });
    expect(c.committedMin).toBe(30);
    expect(c.timeBlockedTasks).toBe(1);
  });

  test("over capacity reports the gap; under reports zero", () => {
    const tiny = [{ iso: "2026-10-16", openBlocks: [{ startMinute: 540, endMinute: 600 }] }];
    const over = computeWeekCapacity({
      days: tiny,
      todayISO: "2026-10-16",
      nowMinute: 0,
      tasks: [{ estimated_minutes: 120, timeBlocked: false }],
      defaultBlockMinute: 60,
    });
    expect(over.overMin).toBe(60);
    const under = computeWeekCapacity({ days: week, todayISO: "2026-10-12", nowMinute: 0, tasks: [], defaultBlockMinute: 60 });
    expect(under.overMin).toBe(0);
  });
});
