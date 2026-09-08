import { describe, expect, test } from "vitest";
import {
  composeFreshness,
  composeFundraising,
  composeGovernance,
  composeMoney,
  composePrograms,
  composeStrategy,
  composeTeam,
} from "@/lib/admin/orgHealthCompose";

// Spec Home, stage H2 — the cause engine: deterministic, honest, never a
// bare status. Same input, same sentence (open decision 3, resolved).

describe("composeMoney", () => {
  const base = { cashOnHand: 120_000, burn3mo: 20_000, anchorStale: false, anchorDate: "2026-09-07" };

  test("thresholds: <3 critical, <6 watch, else healthy — cause carries the numbers", () => {
    expect(composeMoney({ ...base, runwayMonths: 2.4 }).status).toBe("critical");
    expect(composeMoney({ ...base, runwayMonths: 4.2 }).status).toBe("watch");
    const v = composeMoney({ ...base, runwayMonths: 6 });
    expect(v.status).toBe("healthy");
    expect(v.cause).toContain("6 mo");
    expect(v.cause).toContain("$120,000");
    expect(v.cause).toContain("$20,000/mo");
  });

  test("no computable runway reads neutral, honestly", () => {
    const v = composeMoney({ ...base, runwayMonths: null });
    expect(v.status).toBe("neutral");
    expect(v.cause).toContain("can't be computed");
  });

  test("a stale anchor travels with the verdict — stale money never reads as authority", () => {
    const v = composeMoney({ ...base, runwayMonths: 8, anchorStale: true, anchorDate: "2026-08-01" });
    expect(v.cause).toContain("from 2026-08-01");
    expect(v.cause).toContain("stale");
  });
});

describe("composeFundraising", () => {
  test("forecast vs goal tiers: 90 healthy, 70 due, 50 watch, below critical", () => {
    const at = (forecast: number) =>
      composeFundraising({ raised: 100, forecast, goal: 100_000, gap: 100_000 - forecast }).status;
    expect(at(95_000)).toBe("healthy");
    expect(at(75_000)).toBe("due");
    expect(at(55_000)).toBe("watch");
    expect(at(30_000)).toBe("critical");
  });

  test("no goal reads neutral — never a fake percentage", () => {
    const v = composeFundraising({ raised: 5000, forecast: 5000, goal: 0, gap: 0 });
    expect(v.status).toBe("neutral");
    expect(v.cause).toContain("No fundraising goal");
  });
});

describe("composePrograms", () => {
  test("the house formula's number tiers and phrasing", () => {
    expect(composePrograms({ attendancePct: 86 }).status).toBe("healthy");
    expect(composePrograms({ attendancePct: 70 }).status).toBe("watch");
    expect(composePrograms({ attendancePct: 40 }).status).toBe("critical");
    expect(composePrograms({ attendancePct: 86 }).cause).toContain("present + late over marked");
  });

  test("no countable marks reads neutral — an honest gap, never a fake 0%", () => {
    const v = composePrograms({ attendancePct: null });
    expect(v.status).toBe("neutral");
    expect(v.cause).toContain("No attendance marked");
  });
});

describe("composeTeam", () => {
  test("overdue drives status; the cause carries both counts", () => {
    expect(composeTeam({ doneThisWeek: 12, overdueOpen: 0 }).status).toBe("healthy");
    expect(composeTeam({ doneThisWeek: 3, overdueOpen: 4 }).status).toBe("watch");
    expect(composeTeam({ doneThisWeek: 0, overdueOpen: 14 }).status).toBe("critical");
    expect(composeTeam({ doneThisWeek: 1, overdueOpen: 1 }).cause).toBe(
      "1 task completed this week; 1 overdue.",
    );
  });
});

describe("composeStrategy", () => {
  test("the glance's own line IS the cause; worst health drives the chip", () => {
    const line = "3 of 5 objectives on track. Growth is behind: Dollars raised is $40k short.";
    expect(composeStrategy({ hasPlan: true, statusLine: line, worstHealth: "behind" })).toEqual({
      status: "critical",
      cause: line,
    });
    expect(composeStrategy({ hasPlan: true, statusLine: line, worstHealth: "at_risk" }).status).toBe("watch");
    expect(composeStrategy({ hasPlan: true, statusLine: "5 of 5 objectives on track.", worstHealth: "on_track" }).status).toBe("healthy");
  });

  test("no plan reads neutral", () => {
    expect(composeStrategy({ hasPlan: false, statusLine: "", worstHealth: null }).status).toBe("neutral");
  });
});

describe("composeGovernance", () => {
  const today = "2026-09-08";

  test("overdue filings are critical; a filing inside 30 days reads due", () => {
    expect(
      composeGovernance({ boardMembers: 12, overdueFilings: 2, nextDue: null, todayISO: today }).status,
    ).toBe("critical");
    const soon = composeGovernance({
      boardMembers: 12, overdueFilings: 0,
      nextDue: { title: "Form 990", due: "2026-09-30" }, todayISO: today,
    });
    expect(soon.status).toBe("due");
    expect(soon.cause).toContain("Form 990");
    const far = composeGovernance({
      boardMembers: 12, overdueFilings: 0,
      nextDue: { title: "RRF-1", due: "2027-04-15" }, todayISO: today,
    });
    expect(far.status).toBe("healthy");
  });

  test("nothing owed is healthy, and the board count still renders", () => {
    const v = composeGovernance({ boardMembers: 7, overdueFilings: 0, nextDue: null, todayISO: today });
    expect(v.status).toBe("healthy");
    expect(v.cause).toContain("7 board members");
  });
});

describe("composeFreshness", () => {
  test("stale tiers, and an unresolved computed metric is always critical (the A4 finding)", () => {
    expect(composeFreshness({ activeMetrics: 20, staleMetrics: 0, unresolved: 0 }).status).toBe("healthy");
    expect(composeFreshness({ activeMetrics: 20, staleMetrics: 2, unresolved: 0 }).status).toBe("watch");
    expect(composeFreshness({ activeMetrics: 20, staleMetrics: 8, unresolved: 0 }).status).toBe("critical");
    const v = composeFreshness({ activeMetrics: 20, staleMetrics: 0, unresolved: 1 });
    expect(v.status).toBe("critical");
    expect(v.cause).toContain("no resolver");
  });

  test("an empty catalog reads neutral", () => {
    expect(composeFreshness({ activeMetrics: 0, staleMetrics: 0, unresolved: 0 }).status).toBe("neutral");
  });

  test("determinism: same input, same sentence", () => {
    const input = { activeMetrics: 20, staleMetrics: 3, unresolved: 0 };
    expect(composeFreshness(input)).toEqual(composeFreshness(input));
  });
});
