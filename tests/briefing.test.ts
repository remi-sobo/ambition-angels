import { describe, expect, test } from "vitest";
import {
  financeSource,
  tasksSource,
  complianceSource,
  majorGiftsSource,
  donorsSource,
  engagementSource,
  strategySource,
  type SourceCtx,
} from "../lib/admin/briefing/sources";
import { buildBriefing, rankItems, isHidden, type ItemState } from "../lib/admin/briefing/engine";
import { summarize } from "../lib/admin/briefing/summary";
import type { DataAge } from "../lib/admin/dataAge";

// Empty inputs for the sources a given test isn't exercising.
const EMPTY = {
  majorGifts: { opportunities: [] },
  donors: { pendingGifts: [] },
  engagement: { sessions: [] },
};

const NOW = new Date("2026-06-15T12:00:00Z").getTime();
const CTX: SourceCtx = { now: NOW, dataAgeDays: 1, staleFlag: false };
const dayStr = (offsetDays: number) =>
  new Date(NOW + offsetDays * 86_400_000).toISOString().slice(0, 10);

const FRESH: DataAge = {
  lastFullSyncAt: new Date(NOW - 86_400_000).toISOString(),
  lastRunAt: new Date(NOW - 86_400_000).toISOString(),
  lastRunStatus: "completed",
  ageDays: 1,
  ageLabel: "1d",
  severity: "fresh",
  computedAt: new Date(NOW).toISOString(),
};
const STALE: DataAge = { ...FRESH, ageDays: 21, ageLabel: "21d", severity: "stale" };

describe("finance source", () => {
  test("runway at/below critical floor → critical", () => {
    const [it] = financeSource({ runwayMonths: 1.0, cashOnHand: 100_000 }, CTX);
    expect(it.severity).toBe("critical");
    expect(it.detail).toContain("1.0");
  });
  test("runway in watch band → watch", () => {
    const [it] = financeSource({ runwayMonths: 5, cashOnHand: 100_000 }, CTX);
    expect(it.severity).toBe("watch");
  });
  test("healthy runway + healthy cash → nothing", () => {
    expect(financeSource({ runwayMonths: 12, cashOnHand: 100_000 }, CTX)).toHaveLength(0);
  });
  test("cash below floor emits a watch", () => {
    const items = financeSource({ runwayMonths: 12, cashOnHand: 10_000 }, CTX);
    expect(items.map((i) => i.id)).toContain("finance:cash");
  });
});

describe("tasks source", () => {
  const t = (id: string, due: number, status = "todo") => ({
    id,
    title: `Task ${id}`,
    due_date: dayStr(due),
    status,
  });
  test("few overdue → watch, names oldest", () => {
    const [it] = tasksSource({ tasks: [t("a", -2), t("b", -5), t("c", +3)] }, CTX);
    expect(it.severity).toBe("watch");
    expect(it.metric).toBe("2");
    expect(it.detail).toContain("Task b"); // oldest (−5)
  });
  test("≥5 overdue → critical", () => {
    const tasks = [-1, -2, -3, -4, -5, -6].map((d, i) => t(`x${i}`, d));
    expect(tasksSource({ tasks }, CTX)[0].severity).toBe("critical");
  });
  test("done tasks are not overdue", () => {
    expect(tasksSource({ tasks: [t("a", -10, "done")] }, CTX)).toHaveLength(0);
  });
});

describe("compliance source", () => {
  const c = (id: string, due: number, status = "upcoming") => ({
    id,
    title: `Filing ${id}`,
    due_date: dayStr(due),
    status,
    jurisdiction: "CA",
  });
  test("overdue → critical, due-soon → due_soon, far-off → nothing", () => {
    const items = complianceSource({ items: [c("a", -3), c("b", 10), c("c", 90)] }, CTX);
    const byId = Object.fromEntries(items.map((i) => [i.id, i.severity]));
    expect(byId["compliance:a"]).toBe("critical");
    expect(byId["compliance:b"]).toBe("due_soon");
    expect(byId["compliance:c"]).toBeUndefined();
  });
});

describe("engine: rank, cap, stale, hide", () => {
  test("rank orders critical → watch → due_soon", () => {
    const mk = (sev: "critical" | "watch" | "due_soon") =>
      financeSource({ runwayMonths: sev === "critical" ? 1 : sev === "watch" ? 5 : 12, cashOnHand: 100_000 }, CTX);
    const items = rankItems([...mk("watch"), ...mk("critical")]);
    expect(items[0].severity).toBe("critical");
  });

  test("stale spine becomes the top item", () => {
    const b = buildBriefing(
      { finance: { runwayMonths: 12, cashOnHand: 100_000 }, tasks: { tasks: [] }, compliance: { items: [] }, ...EMPTY },
      STALE,
      new Map(),
      NOW,
    );
    expect(b.top[0].id).toBe("sync:stale");
    expect(b.top[0].severity).toBe("critical");
  });

  test("hard cap of 5 with overflow counted", () => {
    const tasks = Array.from({ length: 3 }, (_, i) => ({
      id: `t${i}`,
      title: `T${i}`,
      due_date: dayStr(-1 - i),
      status: "todo",
    }));
    const compliance = Array.from({ length: 6 }, (_, i) => ({
      id: `c${i}`,
      title: `C${i}`,
      due_date: dayStr(-1 - i),
      status: "upcoming",
      jurisdiction: null,
    }));
    const b = buildBriefing(
      { finance: { runwayMonths: 1, cashOnHand: 10_000 }, tasks: { tasks }, compliance: { items: compliance }, ...EMPTY },
      FRESH,
      new Map(),
      NOW,
    );
    expect(b.top).toHaveLength(5);
    expect(b.restCount).toBeGreaterThan(0);
  });

  test("snoozed item is hidden until its hidden_until passes", () => {
    const states = new Map<string, ItemState>([
      ["finance:runway", { item_id: "finance:runway", decision: "snooze", hidden_until: new Date(NOW + 3_600_000).toISOString() }],
    ]);
    expect(isHidden("finance:runway", states, NOW)).toBe(true);
    expect(isHidden("finance:runway", states, NOW + 7_200_000)).toBe(false);
  });

  test("dismissed item stays hidden; empty feed when nothing needs you", () => {
    const states = new Map<string, ItemState>([
      ["finance:runway", { item_id: "finance:runway", decision: "dismiss", hidden_until: null }],
    ]);
    const b = buildBriefing(
      { finance: { runwayMonths: 1, cashOnHand: 100_000 }, tasks: { tasks: [] }, compliance: { items: [] }, ...EMPTY },
      FRESH,
      states,
      NOW,
    );
    expect(b.top).toHaveLength(0);
  });
});

describe("major gifts source", () => {
  const o = (id: string, ask: number | null, step: string | null, due: number | null) => ({
    id,
    name: `Ask ${id}`,
    ask_amount: ask,
    next_step: step,
    next_step_due: due == null ? null : dayStr(due),
  });
  test("≥3 overdue next steps → critical, sums dollars at stake", () => {
    const items = majorGiftsSource(
      { opportunities: [o("a", 5000, "Call", -1), o("b", 10000, "Email", -2), o("c", 20000, "Visit", -3)] },
      CTX,
    );
    const overdue = items.find((i) => i.id === "major_gifts:overdue_step")!;
    expect(overdue.severity).toBe("critical");
    expect(overdue.metric).toBe("$35,000");
  });
  test("high-value ask with no next step → watch; small ask ignored", () => {
    const items = majorGiftsSource(
      { opportunities: [o("a", 50000, null, null), o("b", 100, null, null)] },
      CTX,
    );
    const stuck = items.find((i) => i.id === "major_gifts:no_step")!;
    expect(stuck.severity).toBe("watch");
    expect(stuck.detail).toContain("$50,000");
  });
});

describe("donors source", () => {
  const g = (id: string, amount: number, ageDays: number) => ({
    id,
    amount,
    gift_date: dayStr(-ageDays),
  });
  test("IRS-required gift past the window → critical", () => {
    const [it] = donorsSource({ pendingGifts: [g("a", 500, 40)] }, CTX);
    expect(it.severity).toBe("critical");
    expect(it.detail).toContain("IRS");
  });
  test("small gift past window → watch; recent gift ignored", () => {
    expect(donorsSource({ pendingGifts: [g("a", 50, 40)] }, CTX)[0].severity).toBe("watch");
    expect(donorsSource({ pendingGifts: [g("b", 500, 2)] }, CTX)).toHaveLength(0);
  });
});

describe("engagement source", () => {
  const s = (id: string, ageDays: number, hasAttendance: boolean) => ({
    id,
    session_date: dayStr(-ageDays),
    hasAttendance,
  });
  test("past session missing attendance → watch; recorded or recent ignored", () => {
    const [it] = engagementSource({ sessions: [s("a", 5, false), s("b", 5, true), s("c", 0, false)] }, CTX);
    expect(it.severity).toBe("watch");
    expect(it.metric).toBe("1");
  });
});

describe("strategy source", () => {
  test("off-track objectives → watch, names the worst (behind first)", () => {
    const [it] = strategySource(
      { objectivesOffTrack: [{ title: "Fundraising", health: "at_risk" }, { title: "Recruitment", health: "behind" }], reviewDueDays: null },
      CTX,
    );
    expect(it.id).toBe("strategy:objectives");
    expect(it.severity).toBe("watch");
    expect(it.detail).toContain("Recruitment"); // behind sorts ahead of at_risk
    expect(it.metric).toBe("2");
  });
  test("review overdue → watch; due soon → due_soon; far off → nothing", () => {
    expect(strategySource({ objectivesOffTrack: [], reviewDueDays: -3 }, CTX)[0].severity).toBe("watch");
    expect(strategySource({ objectivesOffTrack: [], reviewDueDays: 4 }, CTX)[0].severity).toBe("due_soon");
    expect(strategySource({ objectivesOffTrack: [], reviewDueDays: 30 }, CTX)).toHaveLength(0);
  });
  test("all healthy + no review → empty", () => {
    expect(strategySource({ objectivesOffTrack: [], reviewDueDays: null }, CTX)).toHaveLength(0);
  });
});

describe("section summaries", () => {
  test("clear section → positive sentence + clear severity", () => {
    const r = summarize("major_gifts", []);
    expect(r.severity).toBe("clear");
    expect(r.sentence.length).toBeGreaterThan(0);
  });
  test("summary uses the worst severity and joins titles", () => {
    const items = majorGiftsSource(
      { opportunities: [{ id: "a", name: "Ask a", ask_amount: 50000, next_step: null, next_step_due: dayStr(-1) }] },
      CTX,
    );
    // one overdue (watch, <3) — severity is watch, sentence names the signal
    const r = summarize("major_gifts", items);
    expect(["critical", "watch"]).toContain(r.severity);
    expect(r.sentence).toContain("overdue next step");
  });
});
