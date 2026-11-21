import { describe, expect, test } from "vitest";
import { figureView, figureFromMetricState, isMissingValue, MISSING_TEXT } from "@/lib/admin/figure";

// V4 Stage A1: spec §2 principle 3, "Missing is never shown as zero."

describe("figureView", () => {
  test("zero is a number, shown as 0", () => {
    const v = figureView({ value: 0 });
    expect(v.state).toBe("fresh");
    expect(v.valueText).toBe("0");
    expect(v.missingText).toBeNull();
  });

  test("null, undefined, empty and NaN are missing, never 0", () => {
    for (const value of [null, undefined, "", "  ", Number.NaN]) {
      const v = figureView({ value });
      expect(v.state).toBe("missing");
      expect(v.valueText).toBeNull();
      expect(v.missingText).toBe(MISSING_TEXT);
    }
    expect(isMissingValue(0)).toBe(false);
    expect(isMissingValue("$0")).toBe(false);
  });

  test("freshness 'missing' wins over a value", () => {
    expect(figureView({ value: 42, freshness: "missing" }).valueText).toBeNull();
  });

  test("a missing value stays missing even when the caller says fresh or stale", () => {
    expect(figureView({ value: null, freshness: "stale" }).state).toBe("missing");
  });

  test("stale keeps the value, adds the badge, warns, and offers Refresh only when wired", () => {
    const v = figureView({ value: "$590,900", freshness: "stale", canRefresh: true });
    expect(v).toMatchObject({ state: "stale", valueText: "$590,900", badge: "Out of date", sourceTone: "warning", showRefresh: true });
    expect(figureView({ value: 1, freshness: "stale" }).showRefresh).toBe(false);
  });

  test("partial keeps the value with a Partial badge", () => {
    expect(figureView({ value: 12, freshness: "partial" })).toMatchObject({ state: "partial", badge: "Partial", valueText: "12" });
  });

  test("numbers get separators, strings pass through", () => {
    expect(figureView({ value: 186400 }).valueText).toBe("186,400");
    expect(figureView({ value: "7.4 months" }).valueText).toBe("7.4 months");
  });
});

describe("figureFromMetricState (the Metric bridge)", () => {
  test("undefined key has no figure", () => {
    expect(figureFromMetricState({ kind: "undefined", key: "x" })).toBeNull();
  });
  test("no snapshot is missing", () => {
    expect(
      figureFromMetricState({ kind: "defined", key: "k", name: "K", display: null, capturedOn: null, flags: [] }),
    ).toEqual({ value: null, freshness: "missing", capturedOn: null });
  });
  test("a stale snapshot is stale; others are fresh", () => {
    const base = { kind: "defined" as const, key: "k", name: "K", display: "12", capturedOn: "2026-11-01" };
    expect(figureFromMetricState({ ...base, flags: [{ flag: "stale-value" }] })?.freshness).toBe("stale");
    expect(figureFromMetricState({ ...base, flags: [{ flag: "unconfirmed" }] })?.freshness).toBe("fresh");
  });
});
