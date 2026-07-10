import { describe, expect, test } from "vitest";
import { buildOutlook, type OutlookInputs } from "@/lib/admin/outlook";

// Status & Outlook (spec #5) — the pure 30/60/90 math over canonical inputs.

const THRESHOLDS = { cashFloorUsd: 25_000, dueCriticalCount: 5 };
const TODAY = "2026-07-10";

const base = (over: Partial<OutlookInputs> = {}): OutlookInputs => ({
  todayISO: TODAY,
  cashOnHand: 100_000,
  monthlyBurn: 30_000,
  inflows: [],
  queueItems: [],
  metrics: [],
  ...over,
});

describe("cash projection", () => {
  test("burn-only decay across the three windows", () => {
    const { windows } = buildOutlook(base(), THRESHOLDS);
    expect(windows.map((w) => w.projectedCash)).toEqual([70_000, 40_000, 10_000]);
  });

  test("committed inflows land in their window; projected stay separate; restricted never count", () => {
    const { windows } = buildOutlook(
      base({
        inflows: [
          { due_date: "2026-07-25", gross_amount: 20_000, confidence: "committed", restricted: false },
          { due_date: "2026-08-20", gross_amount: 15_000, confidence: "projected", restricted: false },
          { due_date: "2026-07-20", gross_amount: 50_000, confidence: "committed", restricted: true },
        ],
      }),
      THRESHOLDS,
    );
    const [w30, w60] = windows;
    expect(w30.committedInflows).toBe(20_000);
    expect(w30.projectedCash).toBe(90_000); // 100k − 30k + 20k; restricted excluded
    expect(w30.projectedInflows).toBe(0);
    expect(w60.projectedInflows).toBe(15_000);
    expect(w60.projectedCash).toBe(60_000); // projected money never enters the cash line
  });

  test("no burn → no cash projection, not a fake zero", () => {
    const { windows } = buildOutlook(base({ monthlyBurn: null }), THRESHOLDS);
    expect(windows.every((w) => w.projectedCash === null)).toBe(true);
  });
});

describe("deadline buckets", () => {
  test("items bucket by window edge and module; overdue counted separately", () => {
    const { windows, overdueNow } = buildOutlook(
      base({
        queueItems: [
          { dueDate: "2026-07-01", module: "ops" }, // overdue — not in any window
          { dueDate: "2026-07-20", module: "ops" },
          { dueDate: "2026-08-09", module: "fundraising" }, // exactly day 30
          { dueDate: "2026-08-10", module: "compliance" }, // day 31 → 60 window
          { dueDate: "2026-10-09", module: "program" }, // > 90 in no window... day 91
          { dueDate: null, module: "finance" },
        ],
      }),
      THRESHOLDS,
    );
    expect(overdueNow).toBe(1);
    expect(windows[0].dueTotal).toBe(2);
    expect(windows[0].dueByModule).toEqual({ ops: 1, fundraising: 1 });
    expect(windows[1].dueTotal).toBe(3); // windows are cumulative from today
    expect(windows[2].dueByModule.program).toBeUndefined();
  });
});

describe("metric trend risk", () => {
  const history = (values: number[], stepDays = 7) =>
    values.map((v, i) => ({
      captured_on: new Date(Date.UTC(2026, 5, 1) + i * stepDays * 86_400_000).toISOString().slice(0, 10),
      value: v,
    }));

  test("behind target and trending flat → off-track with a projection", () => {
    const { windows } = buildOutlook(
      base({
        metrics: [
          { metric_key: "flat", name: "Flat", target: 100, direction: "up", history: history([50, 50, 50, 50]) },
        ],
      }),
      THRESHOLDS,
    );
    expect(windows[0].metricsOffTrack).toHaveLength(1);
    expect(windows[0].metricsOffTrack[0].projected).toBe(50);
  });

  test("behind target but climbing fast enough → quiet", () => {
    const { windows } = buildOutlook(
      base({
        metrics: [
          // +10/week from 70: hits 100 well inside 30 days.
          { metric_key: "climb", name: "Climb", target: 100, direction: "up", history: history([50, 60, 70]) },
        ],
      }),
      THRESHOLDS,
    );
    expect(windows[0].metricsOffTrack).toHaveLength(0);
  });

  test("already meeting target, or too little history → quiet", () => {
    const { windows } = buildOutlook(
      base({
        metrics: [
          { metric_key: "met", name: "Met", target: 100, direction: "up", history: history([120, 125]) },
          { metric_key: "thin", name: "Thin", target: 100, direction: "up", history: history([10]) },
        ],
      }),
      THRESHOLDS,
    );
    expect(windows.every((w) => w.metricsOffTrack.length === 0)).toBe(true);
  });

  test("down-is-better metrics flag when trending up past target", () => {
    const { windows } = buildOutlook(
      base({
        metrics: [
          { metric_key: "burnm", name: "Burn", target: 20, direction: "down", history: history([25, 30, 35]) },
        ],
      }),
      THRESHOLDS,
    );
    expect(windows[0].metricsOffTrack).toHaveLength(1);
  });
});

describe("levels", () => {
  test("projected cash at/below zero is critical; below the floor is watch", () => {
    const { windows } = buildOutlook(base({ cashOnHand: 50_000, monthlyBurn: 30_000 }), THRESHOLDS);
    // 30d: 20k (≤25k floor → watch); 60d: −10k (critical); 90d: −40k (critical)
    expect(windows.map((w) => w.level)).toEqual(["watch", "critical", "critical"]);
  });

  test("deadline pile-up alone reaches watch", () => {
    const items = Array.from({ length: 6 }, (_, i) => ({
      dueDate: `2026-07-${15 + i}`,
      module: "ops",
    }));
    const { windows } = buildOutlook(base({ cashOnHand: 500_000, queueItems: items }), THRESHOLDS);
    expect(windows[0].level).toBe("watch");
  });
});
