import { describe, expect, it } from "vitest";
import { computeWeekSummary, formatHours } from "@/lib/agenda/week-summary";
import { computeOpenBlocks } from "@/lib/admin/ops/open-blocks";

const empty = { meetings: [], blocks: [] };

describe("computeWeekSummary", () => {
  it("sums meetings, blocks, and open time across the week", () => {
    const summary = computeWeekSummary({
      days: [
        {
          meetings: [{ startMin: 600, endMin: 660 }], // 1h meeting
          blocks: [{ startMin: 660, endMin: 780 }], // 2h block
        },
        empty,
        empty,
        empty,
        empty,
      ],
      workStartMin: 540, // 9:00
      workEndMin: 1020, // 17:00
      blockTasksTotal: 4,
      blockTasksDone: 3,
    });
    expect(summary.meetingMin).toBe(60);
    expect(summary.blockedMin).toBe(120);
    // 5 days × 8h = 2400 working minutes, minus 3 busy hours.
    expect(summary.openMin).toBe(2400 - 180);
    expect(summary.blockTasksDone).toBe(3);
    expect(summary.blockTasksTotal).toBe(4);
  });

  it("merges overlaps so a double-booked hour counts once against open time", () => {
    const summary = computeWeekSummary({
      days: [
        {
          meetings: [
            { startMin: 600, endMin: 660 },
            { startMin: 630, endMin: 690 }, // overlaps the first by 30m
          ],
          blocks: [{ startMin: 640, endMin: 700 }], // rides on top of both
        },
      ],
      workStartMin: 540,
      workEndMin: 1020,
      blockTasksTotal: 0,
      blockTasksDone: 0,
    });
    // Meeting bucket merges internally: 600–690 = 90m.
    expect(summary.meetingMin).toBe(90);
    expect(summary.blockedMin).toBe(60);
    // Busy union is 600–700 = 100m, not 90 + 60.
    expect(summary.openMin).toBe(480 - 100);
  });

  it("clips busy time outside working hours out of the open computation", () => {
    const summary = computeWeekSummary({
      days: [
        {
          meetings: [{ startMin: 420, endMin: 570 }], // 7:00–9:30, only 30m in-hours
          blocks: [],
        },
      ],
      workStartMin: 540,
      workEndMin: 1020,
      blockTasksTotal: 0,
      blockTasksDone: 0,
    });
    expect(summary.meetingMin).toBe(150); // full duration still reported
    expect(summary.openMin).toBe(480 - 30);
  });

  it("keeps weekend meetings in totals but out of open time", () => {
    const summary = computeWeekSummary({
      days: [
        { meetings: [], blocks: [], workday: true },
        { meetings: [{ startMin: 600, endMin: 660 }], blocks: [], workday: false }, // Saturday
      ],
      workStartMin: 540,
      workEndMin: 1020,
      blockTasksTotal: 0,
      blockTasksDone: 0,
    });
    expect(summary.meetingMin).toBe(60); // still reported
    expect(summary.openMin).toBe(480); // one working day, untouched
  });

  it("formats hour labels", () => {
    expect(formatHours(45)).toBe("45m");
    expect(formatHours(120)).toBe("2h");
    expect(formatHours(150)).toBe("2h 30m");
  });
});

describe("computeOpenBlocks with per-user hours", () => {
  const midnight = Date.UTC(2026, 8, 7); // any anchor; math is relative

  it("defaults to 9–5 when no hours are passed", () => {
    const blocks = computeOpenBlocks(midnight, []);
    expect(blocks).toEqual([{ startMinute: 540, endMinute: 1020 }]);
  });

  it("respects custom working hours", () => {
    const blocks = computeOpenBlocks(midnight, [], { startMinute: 480, endMinute: 1140 });
    expect(blocks).toEqual([{ startMinute: 480, endMinute: 1140 }]);
  });

  it("cuts gaps around busy intervals inside the custom window", () => {
    const busy = [
      { start: midnight + 600 * 60_000, end: midnight + 660 * 60_000 }, // 10–11
    ];
    const blocks = computeOpenBlocks(midnight, busy, { startMinute: 480, endMinute: 720 });
    expect(blocks).toEqual([
      { startMinute: 480, endMinute: 600 },
      { startMinute: 660, endMinute: 720 },
    ]);
  });
});
