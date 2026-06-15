import { describe, expect, test } from "vitest";

import { ageLabel, ageDays, severity } from "../lib/admin/dataAge";

const NOW = new Date("2026-06-15T12:00:00Z").getTime();
const ago = (mins: number) => new Date(NOW - mins * 60_000).toISOString();
const days = (d: number) => ago(d * 24 * 60);

describe("data age — honest labels", () => {
  test("ageLabel scales through minutes/hours/days", () => {
    expect(ageLabel(ago(0), NOW)).toBe("just now");
    expect(ageLabel(ago(5), NOW)).toBe("5m");
    expect(ageLabel(ago(90), NOW)).toBe("1h");
    // The bug the spec calls out: ~21 days used to render as "500h ago".
    expect(ageLabel(days(21), NOW)).toBe("21d");
    expect(ageLabel(null, NOW)).toBe("never");
  });

  test("ageDays counts whole days, null when never synced", () => {
    expect(ageDays(days(21), NOW)).toBe(21);
    expect(ageDays(ago(10), NOW)).toBe(0);
    expect(ageDays(null, NOW)).toBeNull();
  });
});

describe("data age — severity thresholds (watch 3d, stale 7d)", () => {
  test("fresh below the watch threshold", () => {
    expect(severity(days(1), NOW)).toBe("fresh");
    expect(severity(days(2), NOW)).toBe("fresh");
  });
  test("watch at/after 3 days", () => {
    expect(severity(days(3), NOW)).toBe("watch");
    expect(severity(days(6), NOW)).toBe("watch");
  });
  test("stale at/after 7 days, and when never fully synced", () => {
    expect(severity(days(7), NOW)).toBe("stale");
    expect(severity(days(21), NOW)).toBe("stale");
    expect(severity(null, NOW)).toBe("stale");
  });
});
