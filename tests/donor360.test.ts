import { describe, expect, test } from "vitest";
import {
  givingByYear,
  reportingOwed,
  REQUIREMENT_KIND_LABEL,
  type RequirementRow,
} from "@/lib/fundraising/donor360";

// Spec Fundraising, stage F2 — the Donor 360's pure panel logic.

describe("givingByYear", () => {
  test("aggregates the full history per calendar-fiscal year, newest first", () => {
    const years = givingByYear([
      { gift_date: "2024-03-01", amount: 100 },
      { gift_date: "2026-01-15", amount: 250 },
      { gift_date: "2024-11-30", amount: 50 },
      { gift_date: "2026-06-01", amount: 250 },
    ]);
    expect(years).toEqual([
      { year: "2026", total: 500, count: 2 },
      { year: "2024", total: 150, count: 2 },
    ]);
  });

  test("empty history → empty list (the panel renders its honest empty state)", () => {
    expect(givingByYear([])).toEqual([]);
  });

  test("one source of truth: the yearly totals sum to the lifetime total", () => {
    const history = [
      { gift_date: "2023-05-05", amount: 20 },
      { gift_date: "2024-05-05", amount: 30.5 },
      { gift_date: "2024-06-06", amount: 49.5 },
    ];
    const lifetime = history.reduce((s, g) => s + g.amount, 0);
    const summed = givingByYear(history).reduce((s, y) => s + y.total, 0);
    expect(summed).toBe(lifetime);
  });
});

describe("reportingOwed", () => {
  const req = (over: Partial<RequirementRow>): RequirementRow => ({
    id: crypto.randomUUID(),
    kind: "interim_report",
    label: null,
    due_date: "2026-10-01",
    status: "upcoming",
    grant_name: "FY27 General Support",
    ...over,
  });

  test("submitted and waived are done; upcoming and in_progress are owed", () => {
    const rows = [
      req({ id: "a", status: "submitted" }),
      req({ id: "b", status: "upcoming" }),
      req({ id: "c", status: "waived" }),
      req({ id: "d", status: "in_progress" }),
    ];
    expect(reportingOwed(rows).map((r) => r.id).sort()).toEqual(["b", "d"]);
  });

  test("soonest due first — overdue rows land on top by the same rule", () => {
    const rows = [
      req({ id: "later", due_date: "2026-12-01" }),
      req({ id: "overdue", due_date: "2026-08-01" }),
      req({ id: "soon", due_date: "2026-09-15" }),
    ];
    expect(reportingOwed(rows).map((r) => r.id)).toEqual(["overdue", "soon", "later"]);
  });

  test("every requirement kind the schema allows has a display label", () => {
    for (const kind of ["loi", "application", "interim_report", "final_report", "financial_report", "other"]) {
      expect(REQUIREMENT_KIND_LABEL[kind], kind).toBeTruthy();
    }
  });
});
