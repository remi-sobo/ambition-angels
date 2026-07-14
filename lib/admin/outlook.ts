/**
 * Status & Outlook — the deterministic 30/60/90 risk outlook (BloomOS V3
 * spec #5, Phase 0 recommendations approved).
 *
 * PURE MODULE, ZERO MIGRATIONS: the outlook is derived at read time from four
 * canonical sources the caller loads (the finance snapshot, the revenue
 * schedule, the action queue, the metric catalog) — storing a forecast would
 * be a written mirror that drifts. No LLM anywhere; Reed narrates this
 * surface in spec #6.
 *
 * Kept free of server imports so tests exercise the real math
 * (tests/outlook.test.ts). The server loader lives in outlookRead.ts.
 *
 * Cash projection is deliberately simple and explainable:
 *   projected = cash on hand − burn·(days/30) + committed inflows dated
 *   inside the window. Projected-confidence inflows are surfaced separately,
 *   never mixed into the committed line — same rule as the runway tiers.
 */

export type OutlookInputs = {
  todayISO: string; // YYYY-MM-DD — injected so the math is reproducible
  cashOnHand: number;
  /** Trailing monthly burn (finance.burn3mo); null/0 disables cash projection. */
  monthlyBurn: number | null;
  /** Dated expected inflows from the canonical revenue schedule. */
  inflows: { due_date: string; gross_amount: number; confidence: "committed" | "projected"; restricted: boolean }[];
  /** Open action items (v_action_items via getActionQueue). */
  queueItems: { dueDate: string | null; module: string }[];
  /** Active catalog metrics with history (oldest→newest). */
  metrics: {
    metric_key: string;
    name: string;
    target: number | null;
    direction: "up" | "down";
    history: { captured_on: string; value: number }[];
  }[];
};

export type OffTrackMetric = {
  metric_key: string;
  name: string;
  current: number;
  target: number;
  /** Where the current trend lands it at the window's end. */
  projected: number;
};

export type OutlookWindow = {
  days: 30 | 60 | 90;
  endDate: string;
  /** Committed-only cash projection; null when burn can't be computed. */
  projectedCash: number | null;
  /** Unrestricted committed / projected inflows dated inside the window. */
  committedInflows: number;
  projectedInflows: number;
  /** Open items due inside the window, total and per module. */
  dueTotal: number;
  dueByModule: Record<string, number>;
  metricsOffTrack: OffTrackMetric[];
  /** 'critical' | 'watch' | 'steady' — same scale as the status line. */
  level: "critical" | "watch" | "steady";
};

export type Outlook = {
  windows: OutlookWindow[];
  overdueNow: number;
};

const DAY = 86_400_000;
export const addDays = (iso: string, n: number) =>
  new Date(new Date(iso + "T00:00:00Z").getTime() + n * DAY).toISOString().slice(0, 10);

/**
 * Whether a queue item's due date falls inside a window's (today, end] range.
 * Shared with the /admin/queue drilldown so the list a chip links to is made
 * of exactly the rows its dueTotal counted — one definition, no drift.
 */
export const isDueInWindow = (dueDate: string | null, todayISO: string, endDate: string): boolean =>
  dueDate != null && dueDate > todayISO && dueDate <= endDate;

/** Least-squares slope (value per day) over a metric's snapshots. */
function slopePerDay(history: { captured_on: string; value: number }[]): number | null {
  if (history.length < 3) return null; // too thin to call a trend
  const t0 = new Date(history[0].captured_on + "T00:00:00Z").getTime();
  const pts = history.map((h) => ({
    x: (new Date(h.captured_on + "T00:00:00Z").getTime() - t0) / DAY,
    y: h.value,
  }));
  const n = pts.length;
  const sx = pts.reduce((s, p) => s + p.x, 0);
  const sy = pts.reduce((s, p) => s + p.y, 0);
  const sxx = pts.reduce((s, p) => s + p.x * p.x, 0);
  const sxy = pts.reduce((s, p) => s + p.x * p.y, 0);
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null; // all snapshots on one day
  return (n * sxy - sx * sy) / denom;
}

export function buildOutlook(
  inputs: OutlookInputs,
  thresholds: { cashFloorUsd: number; dueCriticalCount: number },
): Outlook {
  const { todayISO } = inputs;
  const overdueNow = inputs.queueItems.filter((it) => it.dueDate != null && it.dueDate < todayISO).length;

  const windows = ([30, 60, 90] as const).map((days): OutlookWindow => {
    const endDate = addDays(todayISO, days);

    // Inflows dated inside (today, end]. Restricted money can't cover general
    // operating (the locked Finance v2 rule), so it never enters the cash line.
    let committedInflows = 0;
    let projectedInflows = 0;
    for (const f of inputs.inflows) {
      if (f.restricted || f.due_date <= todayISO || f.due_date > endDate) continue;
      if (f.confidence === "committed") committedInflows += f.gross_amount;
      else projectedInflows += f.gross_amount;
    }

    const burn = inputs.monthlyBurn && inputs.monthlyBurn > 0 ? inputs.monthlyBurn : null;
    const projectedCash =
      burn === null ? null : Math.round(inputs.cashOnHand - burn * (days / 30) + committedInflows);

    const dueByModule: Record<string, number> = {};
    let dueTotal = 0;
    for (const it of inputs.queueItems) {
      if (!isDueInWindow(it.dueDate, todayISO, endDate)) continue;
      dueTotal += 1;
      dueByModule[it.module] = (dueByModule[it.module] ?? 0) + 1;
    }

    // A metric is off-track for this window when it misses its target today
    // AND its trend still misses at the window's end. Metrics already meeting
    // target, or with too little history to trend, stay quiet (noise guard).
    const metricsOffTrack: OffTrackMetric[] = [];
    for (const m of inputs.metrics) {
      if (m.target == null || m.history.length === 0) continue;
      const current = m.history[m.history.length - 1].value;
      const meets = (v: number) => (m.direction === "up" ? v >= m.target! : v <= m.target!);
      if (meets(current)) continue;
      const slope = slopePerDay(m.history);
      if (slope === null) continue;
      const elapsed =
        (new Date(todayISO + "T00:00:00Z").getTime() -
          new Date(m.history[m.history.length - 1].captured_on + "T00:00:00Z").getTime()) / DAY;
      const projected = current + slope * (elapsed + days);
      if (meets(projected)) continue;
      metricsOffTrack.push({
        metric_key: m.metric_key,
        name: m.name,
        current,
        target: m.target,
        projected: Math.round(projected * 100) / 100,
      });
    }

    let level: OutlookWindow["level"] = "steady";
    if (projectedCash !== null && projectedCash <= 0) level = "critical";
    else if (
      (projectedCash !== null && projectedCash <= thresholds.cashFloorUsd) ||
      dueTotal >= thresholds.dueCriticalCount
    )
      level = "watch";
    else if (dueTotal > 0 || metricsOffTrack.length > 0) level = "steady"; // informative, not alarming

    return {
      days,
      endDate,
      projectedCash,
      committedInflows: Math.round(committedInflows),
      projectedInflows: Math.round(projectedInflows),
      dueTotal,
      dueByModule,
      metricsOffTrack,
      level,
    };
  });

  return { windows, overdueNow };
}
