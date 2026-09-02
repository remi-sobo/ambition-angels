import { describe, expect, it } from "vitest";
import {
  formatDuration,
  formatMinute,
  formatMinuteRange,
  layoutLanes,
  snapMin,
} from "@/lib/agenda/week-grid";

describe("minute formatting", () => {
  it("formats single minutes with meridiem", () => {
    expect(formatMinute(540)).toBe("9 AM");
    expect(formatMinute(750)).toBe("12:30 PM");
    expect(formatMinute(0)).toBe("12 AM");
    expect(formatMinute(720)).toBe("12 PM");
  });

  it("drops the shared meridiem in ranges", () => {
    expect(formatMinuteRange(540, 630)).toBe("9 – 10:30 AM");
    expect(formatMinuteRange(690, 780)).toBe("11:30 AM – 1 PM");
    expect(formatMinuteRange(780, 840)).toBe("1 – 2 PM");
  });

  it("formats durations", () => {
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(90)).toBe("1h 30m");
  });

  it("snaps to the 15-minute grid", () => {
    expect(snapMin(547)).toBe(540);
    expect(snapMin(548)).toBe(555);
    expect(snapMin(0)).toBe(0);
  });
});

describe("layoutLanes", () => {
  const item = (startMin: number, endMin: number) => ({ startMin, endMin });

  it("gives non-overlapping items the full width", () => {
    const a = item(540, 600);
    const b = item(600, 660);
    const placed = layoutLanes([a, b]);
    expect(placed.get(a)).toEqual({ lane: 0, lanes: 1 });
    expect(placed.get(b)).toEqual({ lane: 0, lanes: 1 });
  });

  it("splits a pair of overlapping items into two lanes", () => {
    const a = item(540, 660);
    const b = item(600, 720);
    const placed = layoutLanes([a, b]);
    expect(placed.get(a)).toEqual({ lane: 0, lanes: 2 });
    expect(placed.get(b)).toEqual({ lane: 1, lanes: 2 });
  });

  it("reuses a freed lane within a cluster (transitive overlap)", () => {
    // a spans the cluster; b ends before c starts, so c takes b's lane, and
    // all three share the cluster's 2-lane width.
    const a = item(540, 720);
    const b = item(540, 600);
    const c = item(630, 720);
    const placed = layoutLanes([a, b, c]);
    expect(placed.get(a)?.lanes).toBe(2);
    expect(placed.get(b)?.lanes).toBe(2);
    expect(placed.get(c)?.lanes).toBe(2);
    expect(placed.get(c)?.lane).toBe(placed.get(b)?.lane);
    expect(placed.get(a)?.lane).not.toBe(placed.get(b)?.lane);
  });

  it("keeps separate clusters at their own widths", () => {
    const a = item(540, 600);
    const b = item(570, 630); // clusters with a
    const c = item(900, 960); // alone later
    const placed = layoutLanes([c, a, b]);
    expect(placed.get(a)?.lanes).toBe(2);
    expect(placed.get(b)?.lanes).toBe(2);
    expect(placed.get(c)).toEqual({ lane: 0, lanes: 1 });
  });

  it("stacks a triple overlap into three lanes", () => {
    const a = item(540, 660);
    const b = item(560, 680);
    const c = item(580, 700);
    const placed = layoutLanes([a, b, c]);
    const lanes = new Set([placed.get(a)?.lane, placed.get(b)?.lane, placed.get(c)?.lane]);
    expect(lanes.size).toBe(3);
    expect(placed.get(a)?.lanes).toBe(3);
  });
});
