import { describe, expect, test } from "vitest";
import {
  financeSource,
  tasksSource,
  complianceSource,
  type SourceCtx,
} from "../lib/admin/briefing/sources";
import { buildBriefing, rankItems, isHidden, type ItemState } from "../lib/admin/briefing/engine";
import type { DataAge } from "../lib/admin/dataAge";

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
      { finance: { runwayMonths: 12, cashOnHand: 100_000 }, tasks: { tasks: [] }, compliance: { items: [] } },
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
      { finance: { runwayMonths: 1, cashOnHand: 10_000 }, tasks: { tasks }, compliance: { items: compliance } },
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
      { finance: { runwayMonths: 1, cashOnHand: 100_000 }, tasks: { tasks: [] }, compliance: { items: [] } },
      FRESH,
      states,
      NOW,
    );
    expect(b.top).toHaveLength(0);
  });
});
