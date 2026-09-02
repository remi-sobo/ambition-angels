import { describe, expect, test } from "vitest";
import {
  rollupStrategy,
  statusWord,
  generateGiftLevels,
  matchGiftLevels,
  upcomingAskMoments,
  groupByMonth,
  addDaysISO,
  type PlanOppRow,
  type AskMoment,
} from "@/lib/fundraising/plan";

// The plan's arithmetic (specs/fundraising-plan.md): committed rolls up from
// the spine in three visible lanes, the gift pyramid always covers the goal,
// and the ask calendar windows and sorts scheduled ask moments.

const opp = (over: Partial<PlanOppRow>): PlanOppRow => ({
  id: Math.random().toString(36).slice(2),
  stage: "ask_made",
  ask_amount: 1000,
  expected_close: "2026-06-01",
  ...over,
});

describe("rollupStrategy", () => {
  test("sums won opps, awarded grants, and campaign gifts into committed lanes", () => {
    const r = rollupStrategy({
      goal: 120000,
      planYear: 2026,
      opps: [
        opp({ stage: "closed_won", ask_amount: 25000 }),
        opp({ stage: "steward", ask_amount: 20000 }),
        opp({ stage: "ask_made", ask_amount: 15000 }), // open, not committed
        opp({ stage: "closed_lost", ask_amount: 50000 }), // lost, nowhere
      ],
      grants: [
        { id: "g1", stage: "awarded", amount_requested: 30000, amount_awarded: 25000 },
        { id: "g2", stage: "submitted", amount_requested: 10000, amount_awarded: null },
        { id: "g3", stage: "declined", amount_requested: 40000, amount_awarded: null },
      ],
      campaignGifts: [
        { amount: 5000, gift_date: "2026-03-10" },
        { amount: 999, gift_date: "2025-12-31" }, // wrong year
      ],
    });
    expect(r.wonOpps).toBe(45000);
    expect(r.awardedGrants).toBe(25000);
    expect(r.campaignGifts).toBe(5000);
    expect(r.committed).toBe(75000);
    expect(r.openPipeline).toBe(25000); // 15k open ask + 10k submitted grant
    expect(r.openCount).toBe(2);
    expect(r.gap).toBe(45000);
  });

  test("scopes opportunities by expected-close year; undated rows stay in", () => {
    const r = rollupStrategy({
      goal: 10000,
      planYear: 2026,
      opps: [
        opp({ stage: "closed_won", ask_amount: 3000, expected_close: "2027-01-15" }),
        opp({ stage: "closed_won", ask_amount: 2000, expected_close: null }),
      ],
      grants: [],
      campaignGifts: [],
    });
    expect(r.wonOpps).toBe(2000);
  });

  test("gap never goes negative", () => {
    const r = rollupStrategy({
      goal: 1000,
      planYear: 2026,
      opps: [opp({ stage: "closed_won", ask_amount: 5000 })],
      grants: [],
      campaignGifts: [],
    });
    expect(r.gap).toBe(0);
  });
});

describe("statusWord", () => {
  test("plain words for each state", () => {
    expect(statusWord({ committed: 0, openPipeline: 0 }, 0)).toBe("No goal set");
    expect(statusWord({ committed: 0, openPipeline: 0 }, 100)).toBe("Not started");
    expect(statusWord({ committed: 10, openPipeline: 0 }, 100)).toBe("Underway");
    expect(statusWord({ committed: 10, openPipeline: 95 }, 100)).toBe("In reach if the pipeline holds");
    expect(statusWord({ committed: 100, openPipeline: 0 }, 100)).toBe("Funded");
  });
});

describe("generateGiftLevels", () => {
  test("descends, uses whole counts, and always covers the goal", () => {
    for (const goal of [1000, 24000, 120000, 199245, 1_000_000]) {
      const levels = generateGiftLevels(goal);
      expect(levels.length).toBeGreaterThan(0);
      for (let i = 1; i < levels.length; i++) {
        expect(levels[i].amount).toBeLessThan(levels[i - 1].amount);
      }
      for (const l of levels) {
        expect(l.count_needed).toBeGreaterThanOrEqual(1);
        expect(Number.isInteger(l.count_needed)).toBe(true);
        expect(l.amount).toBeGreaterThanOrEqual(250);
      }
      const covered = levels.reduce((s, l) => s + l.amount * l.count_needed, 0);
      expect(covered).toBeGreaterThanOrEqual(goal);
    }
  });

  test("lead gift is a nice figure near 20% of the goal", () => {
    const levels = generateGiftLevels(120000);
    expect(levels[0].amount).toBe(25000);
    expect(levels[0].count_needed).toBe(1);
  });

  test("empty for a zero goal", () => {
    expect(generateGiftLevels(0)).toEqual([]);
  });
});

describe("matchGiftLevels", () => {
  const levels = [
    { amount: 10000, count_needed: 1 },
    { amount: 5000, count_needed: 2 },
    { amount: 2500, count_needed: 4 },
  ];

  test("assigns each opp to the highest level its ask reaches", () => {
    const matched = matchGiftLevels(
      levels,
      [
        opp({ stage: "ask_made", ask_amount: 12000 }), // → 10k, identified
        opp({ stage: "closed_won", ask_amount: 8000 }), // → 5k, committed
        opp({ stage: "cultivate", ask_amount: 2500 }), // → 2.5k, identified
        opp({ stage: "ask_made", ask_amount: 100 }), // under the base — off the table
        opp({ stage: "closed_lost", ask_amount: 9999 }), // lost — nowhere
      ],
      2026
    );
    expect(matched.map((l) => l.amount)).toEqual([10000, 5000, 2500]);
    expect(matched[0].identified).toBe(1);
    expect(matched[0].committed).toBe(0);
    expect(matched[1].committed).toBe(1);
    expect(matched[2].identified).toBe(1);
  });

  test("respects the plan year", () => {
    const matched = matchGiftLevels(
      levels,
      [opp({ stage: "closed_won", ask_amount: 10000, expected_close: "2025-11-01" })],
      2026
    );
    expect(matched[0].committed).toBe(0);
  });
});

describe("upcomingAskMoments", () => {
  const moment = (date: string, label = "x"): AskMoment => ({
    kind: "opportunity_close",
    date,
    label,
    detail: "",
    amount: null,
    href: "/",
  });

  test("windows to [from, from+days] and sorts by date", () => {
    const out = upcomingAskMoments(
      [moment("2026-09-20", "b"), moment("2026-09-05", "a"), moment("2026-12-25"), moment("2026-08-30")],
      { from: "2026-09-01", days: 90 }
    );
    expect(out.map((m) => m.date)).toEqual(["2026-09-05", "2026-09-20"]);
  });

  test("groupByMonth buckets in order of appearance of sorted input", () => {
    const out = groupByMonth([moment("2026-09-05"), moment("2026-09-20"), moment("2026-10-01")]);
    expect(out.map((b) => b.month)).toEqual(["2026-09", "2026-10"]);
    expect(out[0].items).toHaveLength(2);
  });

  test("addDaysISO crosses month boundaries", () => {
    expect(addDaysISO("2026-08-30", 7)).toBe("2026-09-06");
  });
});
