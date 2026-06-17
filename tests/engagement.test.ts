import { describe, expect, test } from "vitest";
import { scoreDonor, bandFor } from "../lib/fundraising/engagement";

const TODAY = "2026-06-17";

describe("scoreDonor", () => {
  test("no gifts → 0 / none", () => {
    expect(scoreDonor([], 0, false, TODAY)).toEqual({ score: 0, band: "none" });
  });

  test("recent, frequent, generous, recurring → strong (capped at 100)", () => {
    // recency 45 + freq 30 + monetary 15 + recurring 10 = 100
    const dates = ["2026-06-01", "2026-05-01", "2026-04-01", "2026-03-01", "2026-02-01",
      "2026-01-01", "2025-12-01", "2025-11-01", "2025-10-01", "2025-09-01"];
    const r = scoreDonor(dates, 6000, true, TODAY);
    expect(r.score).toBe(100);
    expect(r.band).toBe("strong");
  });

  test("single small recent gift → at risk", () => {
    // recency 45 + freq 6 + monetary 2 = 53 -> steady actually
    const r = scoreDonor(["2026-06-01"], 25, false, TODAY);
    expect(r.score).toBe(53);
    expect(r.band).toBe("steady");
  });

  test("lapsed donor (last gift > 2y) scores low", () => {
    // recency 5 + freq 12 (2 gifts) + monetary 9 ($500) = 26 -> at_risk
    const r = scoreDonor(["2023-01-01", "2022-06-01"], 500, false, TODAY);
    expect(r.score).toBe(26);
    expect(r.band).toBe("at_risk");
  });

  test("recurring adds 10", () => {
    const base = scoreDonor(["2026-05-01"], 100, false, TODAY).score;
    const withRec = scoreDonor(["2026-05-01"], 100, true, TODAY).score;
    expect(withRec - base).toBe(10);
  });

  test("uses most recent gift for recency regardless of order", () => {
    const a = scoreDonor(["2020-01-01", "2026-06-10"], 100, false, TODAY);
    const b = scoreDonor(["2026-06-10", "2020-01-01"], 100, false, TODAY);
    expect(a.score).toBe(b.score);
  });
});

describe("bandFor", () => {
  test("boundaries", () => {
    expect(bandFor(0)).toBe("none");
    expect(bandFor(39)).toBe("at_risk");
    expect(bandFor(40)).toBe("steady");
    expect(bandFor(69)).toBe("steady");
    expect(bandFor(70)).toBe("strong");
  });
});
