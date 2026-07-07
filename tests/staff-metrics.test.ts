import { describe, expect, test } from "vitest";
import {
  kpiStatusFor,
  isAutoMetricKey,
  STAFF_METRIC_META,
} from "@/lib/admin/staff/metrics";

// The staff KPI status derivation mirrors the plan health scale so a personal
// KPI chip means the same as every other chip. These lock the thresholds.
describe("kpiStatusFor", () => {
  test("no value → not_started", () => {
    expect(kpiStatusFor(null, 10)).toBe("not_started");
  });

  test("no/zero target but a value → on_track (can't pace it)", () => {
    expect(kpiStatusFor(5, null)).toBe("on_track");
    expect(kpiStatusFor(5, 0)).toBe("on_track");
  });

  test("up-is-good thresholds against target", () => {
    expect(kpiStatusFor(10, 10)).toBe("done"); // ratio 1.0
    expect(kpiStatusFor(12, 10)).toBe("done"); // over target
    expect(kpiStatusFor(7, 10)).toBe("on_track"); // 0.70
    expect(kpiStatusFor(5, 10)).toBe("at_risk"); // 0.50
    expect(kpiStatusFor(3, 10)).toBe("behind"); // 0.30
  });

  test("down-is-good inverts the ratio (lower current is better)", () => {
    // target 5, current 4 → ratio target/current = 1.25 → done
    expect(kpiStatusFor(4, 5, "down")).toBe("done");
    // current 10 vs target 5 → ratio 0.5 → at_risk
    expect(kpiStatusFor(10, 5, "down")).toBe("at_risk");
  });
});

describe("auto-metric registry", () => {
  test("isAutoMetricKey only accepts known keys", () => {
    expect(isAutoMetricKey("cash_runway_months")).toBe(true);
    expect(isAutoMetricKey("not_a_real_metric")).toBe(false);
    expect(isAutoMetricKey(null)).toBe(false);
    expect(isAutoMetricKey(undefined)).toBe(false);
  });

  test("META is the auto-key source of truth", () => {
    for (const key of Object.keys(STAFF_METRIC_META)) {
      expect(isAutoMetricKey(key)).toBe(true);
    }
    expect(Object.keys(STAFF_METRIC_META).length).toBeGreaterThan(0);
  });
});
