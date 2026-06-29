import { describe, expect, test } from "vitest";
import {
  assembleRunwayPledges,
  computeRunway,
  endOfMonthISO,
  summarizePledges,
  type RunwayPledge,
} from "../lib/finance/runway";

// A pledge with sensible defaults; override per case.
const pledge = (p: Partial<RunwayPledge>): RunwayPledge => ({
  amount: 0,
  status: "secured",
  expected_date: null,
  restricted: false,
  ...p,
});

describe("computeRunway", () => {
  test("cash tier: bank net of what's left to spend this month, no +1", () => {
    // baseline 50k, 20k already spent → 30k left this month. afterMonth = 70k.
    // D1: months beyond now = 70k / 50k = 1.4 (NOT 2.4 with a +1).
    const r = computeRunway({
      baseline: 50_000,
      bankBalance: 100_000,
      mtdSpend: 20_000,
      duePledges: 0,
      projPledges: 0,
      horizonMonths: 3,
    });
    expect(r.inputs.remainingThisMonth).toBe(30_000);
    expect(r.inputs.afterMonth).toBe(70_000);
    expect(r.cash.months).toBeCloseTo(1.4, 10);
    expect(r.cash.base).toBe(70_000);
  });

  test("due and projected stack pledges at full value", () => {
    const r = computeRunway({
      baseline: 50_000,
      bankBalance: 100_000,
      mtdSpend: 20_000, // afterMonth = 70k
      duePledges: 50_000,
      projPledges: 100_000,
      horizonMonths: 3,
    });
    expect(r.cash.months).toBeCloseTo(1.4, 10); // 70k / 50k
    expect(r.due.months).toBeCloseTo(2.4, 10); // 120k / 50k
    expect(r.projected.months).toBeCloseTo(4.4, 10); // 220k / 50k
    expect(r.due.base).toBe(120_000);
    expect(r.projected.base).toBe(220_000);
  });

  test("overspent month: remainingThisMonth clamps at 0, afterMonth = bank", () => {
    const r = computeRunway({
      baseline: 50_000,
      bankBalance: 100_000,
      mtdSpend: 60_000, // already over baseline this month
      duePledges: 0,
      projPledges: 0,
      horizonMonths: 3,
    });
    expect(r.inputs.remainingThisMonth).toBe(0);
    expect(r.inputs.afterMonth).toBe(100_000);
    expect(r.cash.months).toBeCloseTo(2.0, 10);
  });

  test("negative afterMonth clamps the cash tier to 0, pledges can still rescue", () => {
    // Bank can't cover the rest of this month: 10k - 50k = -40k.
    const r = computeRunway({
      baseline: 50_000,
      bankBalance: 10_000,
      mtdSpend: 0,
      duePledges: 60_000,
      projPledges: 0,
      horizonMonths: 3,
    });
    expect(r.inputs.afterMonth).toBe(-40_000);
    expect(r.cash.months).toBe(0); // clamped, never negative
    expect(r.due.months).toBeCloseTo(0.4, 10); // (-40k + 60k) / 50k
  });

  test("null/zero baseline yields null months, never NaN", () => {
    const r = computeRunway({
      baseline: 0,
      bankBalance: 100_000,
      mtdSpend: 0,
      duePledges: 25_000,
      projPledges: 0,
      horizonMonths: 3,
    });
    expect(r.cash.months).toBeNull();
    expect(r.due.months).toBeNull();
    expect(r.projected.months).toBeNull();
    // base dollars still computed for display
    expect(r.cash.base).toBe(100_000);
    expect(r.due.base).toBe(125_000);
  });
});

describe("summarizePledges", () => {
  const endCur = "2026-06-30";
  const endHorizon = "2026-09-30"; // 3-month horizon from June

  test("buckets due vs projected vs beyond-horizon by date", () => {
    const sums = summarizePledges(
      [
        pledge({ amount: 10_000, expected_date: "2026-06-15" }), // due
        pledge({ amount: 5_000, expected_date: "2026-04-01" }), // overdue → still due
        pledge({ amount: 20_000, expected_date: "2026-08-10" }), // projected
        pledge({ amount: 99_000, expected_date: "2026-12-01" }), // beyond horizon → dropped
      ],
      endCur,
      endHorizon
    );
    expect(sums.duePledges).toBe(15_000);
    expect(sums.projPledges).toBe(20_000);
    expect(sums.undatedUnreceivedCount).toBe(0);
  });

  test("weighted pipeline (projected) is never 'due', even dated this month", () => {
    const sums = summarizePledges(
      [
        pledge({ amount: 50_000, status: "secured", expected_date: "2026-06-15" }), // committed → due
        pledge({ amount: 20_000, status: "projected", expected_date: "2026-06-15" }), // pipeline → projected, not due
        pledge({ amount: 10_000, status: "projected", expected_date: "2026-08-01" }), // pipeline later → projected
      ],
      endCur,
      endHorizon
    );
    expect(sums.duePledges).toBe(50_000); // only the committed one
    expect(sums.projPledges).toBe(30_000); // both pipeline rows
  });

  test("received is excluded (already in the bank)", () => {
    const sums = summarizePledges(
      [pledge({ amount: 10_000, status: "received", expected_date: "2026-06-10" })],
      endCur,
      endHorizon
    );
    expect(sums.duePledges).toBe(0);
  });

  test("restricted is excluded from both tiers", () => {
    const sums = summarizePledges(
      [
        pledge({ amount: 10_000, expected_date: "2026-06-10", restricted: true }),
        pledge({ amount: 8_000, expected_date: "2026-08-10", restricted: true }),
      ],
      endCur,
      endHorizon
    );
    expect(sums.duePledges).toBe(0);
    expect(sums.projPledges).toBe(0);
  });

  test("undated unreceived pledges are counted for the nudge, not summed", () => {
    const sums = summarizePledges(
      [
        pledge({ amount: 10_000, expected_date: null }),
        pledge({ amount: 7_000, expected_date: null, restricted: true }), // restricted → not nudged
        pledge({ amount: 3_000, expected_date: null, status: "received" }), // received → not nudged
      ],
      endCur,
      endHorizon
    );
    expect(sums.duePledges).toBe(0);
    expect(sums.projPledges).toBe(0);
    expect(sums.undatedUnreceivedCount).toBe(1);
  });
});

describe("assembleRunwayPledges", () => {
  test("merges both sources and hides HubSpot deals already adopted", () => {
    const bloom = [pledge({ amount: 1, externalRef: "deal-1" })]; // adopted copy
    const hubspot = [
      pledge({ amount: 2, externalRef: "deal-1" }), // dup of the adopted one
      pledge({ amount: 3, externalRef: "deal-2" }), // not adopted → kept
    ];
    const merged = assembleRunwayPledges(bloom, hubspot, new Set(["deal-1"]));
    expect(merged.map((p) => p.amount).sort()).toEqual([1, 3]);
  });

  test("with no adopted refs, keeps everything", () => {
    const merged = assembleRunwayPledges(
      [pledge({ amount: 1 })],
      [pledge({ amount: 2, externalRef: "deal-2" })]
    );
    expect(merged).toHaveLength(2);
  });
});

describe("endOfMonthISO", () => {
  test("end of the current month and N months out", () => {
    const june = new Date(2026, 5, 18); // 2026-06-18 (local)
    expect(endOfMonthISO(june, 0)).toBe("2026-06-30");
    expect(endOfMonthISO(june, 3)).toBe("2026-09-30");
  });

  test("rolls across a year boundary", () => {
    const nov = new Date(2026, 10, 5); // 2026-11-05
    expect(endOfMonthISO(nov, 3)).toBe("2027-02-28");
  });
});
