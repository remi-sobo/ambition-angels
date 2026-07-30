import { describe, expect, test } from "vitest";
import { inYear, futureCloseYears } from "../lib/fundraising/pipeline-year";

const opp = (expectedClose: string | null) => ({ expectedClose });

describe("inYear", () => {
  test("matches only the expected-close calendar year", () => {
    expect(inYear(opp("2026-06-15"), "2026")).toBe(true);
    expect(inYear(opp("2026-12-31"), "2025")).toBe(false);
  });

  test("hides future-year pledges from this-year and last-year views", () => {
    const future = opp("2027-03-01");
    expect(inYear(future, "2026")).toBe(false);
    expect(inYear(future, "2025")).toBe(false);
    expect(inYear(future, "2027")).toBe(true);
  });

  test("'all' shows everything", () => {
    expect(inYear(opp("2031-01-01"), "all")).toBe(true);
    expect(inYear(opp("2019-01-01"), "all")).toBe(true);
    expect(inYear(opp(null), "all")).toBe(true);
  });

  test("undated entries stay visible under every filter", () => {
    expect(inYear(opp(null), "2026")).toBe(true);
    expect(inYear(opp(null), "2025")).toBe(true);
  });
});

describe("futureCloseYears", () => {
  test("returns each future year with a dated entry, deduped and ascending", () => {
    const opps = [
      opp("2026-05-01"), // current year — not a future tab
      opp("2025-11-01"), // past — not a future tab
      opp("2028-01-15"),
      opp("2027-06-30"),
      opp("2027-09-01"), // duplicate year
      opp(null),
    ];
    expect(futureCloseYears(opps, 2026)).toEqual([2027, 2028]);
  });

  test("empty when nothing closes in a future year", () => {
    expect(futureCloseYears([opp("2026-01-01"), opp(null)], 2026)).toEqual([]);
  });

  test("ignores malformed close dates", () => {
    expect(futureCloseYears([opp("soon"), opp("")], 2026)).toEqual([]);
  });
});
