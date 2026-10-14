import { describe, expect, test } from "vitest";
import { ESTIMATE_CHIPS, ESTIMATE_MAX, formatEstimate, parseEstimate } from "@/lib/admin/ops/estimates";

describe("parseEstimate (route validation matches the column check)", () => {
  test("whole minutes inside 1..960 pass through", () => {
    expect(parseEstimate(1)).toBe(1);
    expect(parseEstimate(90)).toBe(90);
    expect(parseEstimate(960)).toBe(960);
  });

  test("null clears the estimate", () => {
    expect(parseEstimate(null)).toBeNull();
  });

  test("out of range, fractional and non-numbers are rejected", () => {
    for (const bad of [0, -15, 961, 30.5, "30", NaN, Infinity, true, {}]) {
      expect(parseEstimate(bad)).toBeUndefined();
    }
  });

  test("every chip is a value the database accepts", () => {
    for (const m of ESTIMATE_CHIPS) expect(parseEstimate(m)).toBe(m);
    expect(Math.max(...ESTIMATE_CHIPS)).toBeLessThanOrEqual(ESTIMATE_MAX);
  });
});

describe("formatEstimate", () => {
  test("chip labels", () => {
    expect(ESTIMATE_CHIPS.map(formatEstimate)).toEqual(["15m", "30m", "1h", "1h 30m", "2h"]);
  });
});
