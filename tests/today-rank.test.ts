import { describe, expect, test } from "vitest";
import { SHOW_CAP, rankObligations, whyFallback, type ObligationRow } from "@/lib/admin/todayRank";

// Spec Home, stage H1 — the Needs-you ranking rule (the flood guard) and the
// honest why-fallback. Pure functions, fixture-fed.

const TODAY = "2026-09-08";

const row = (over: Partial<ObligationRow>): ObligationRow => ({
  id: `ops_task:${Math.random().toString(36).slice(2)}`,
  type: "ops_task",
  title: "A task",
  why_it_matters: null,
  due_date: null,
  state: "open",
  module: "ops",
  ...over,
});

describe("rankObligations: overdue → due today → future → undated", () => {
  test("the bucket order, with most-overdue first and soonest-future first", () => {
    const rows = [
      row({ id: "a", due_date: "2026-09-10", title: "future far" }),
      row({ id: "b", due_date: null, title: "undated" }),
      row({ id: "c", due_date: "2026-09-08", title: "due today" }),
      row({ id: "d", due_date: "2026-09-01", title: "very overdue" }),
      row({ id: "e", due_date: "2026-09-07", title: "barely overdue" }),
      row({ id: "f", due_date: "2026-09-09", title: "future near" }),
    ];
    expect(rankObligations(rows, TODAY).map((r) => r.id)).toEqual(["d", "e", "c", "f", "a", "b"]);
  });

  test("undated rows rank by source weight: human-owned sources over derived arms", () => {
    const rows = [
      row({ id: "stale", type: "metric_stale", title: "z metric" }),
      row({ id: "task", type: "ops_task", title: "z task" }),
      row({ id: "app", type: "application_pending", title: "z app" }),
      row({ id: "grant", type: "grant_requirement", title: "a grant" }),
      row({ id: "recon", type: "reconciliation_item", title: "z recon" }),
    ];
    expect(rankObligations(rows, TODAY).map((r) => r.id)).toEqual([
      "grant", "task", "recon", "app", "stale",
    ]);
  });

  test("ties break by source weight then title — the order is stable", () => {
    const rows = [
      row({ id: "x", type: "metric_stale", due_date: "2026-09-08", title: "b" }),
      row({ id: "y", type: "ops_task", due_date: "2026-09-08", title: "c" }),
      row({ id: "z", type: "ops_task", due_date: "2026-09-08", title: "a" }),
    ];
    expect(rankObligations(rows, TODAY).map((r) => r.id)).toEqual(["z", "y", "x"]);
  });

  test("the flood guard: 103 rows rank fully; the cap is the SCREEN's job", () => {
    const rows = Array.from({ length: 103 }, (_, i) =>
      row({ id: `r${i}`, title: `t${String(i).padStart(3, "0")}` }),
    );
    const ranked = rankObligations(rows, TODAY);
    expect(ranked).toHaveLength(103); // ranking never truncates
    expect(SHOW_CAP).toBe(7); // the screen slices; "show all N" renders the rest
  });

  test("does not mutate its input", () => {
    const rows = [row({ id: "a", due_date: "2026-09-01" }), row({ id: "b" })];
    const before = rows.map((r) => r.id);
    rankObligations(rows, TODAY);
    expect(rows.map((r) => r.id)).toEqual(before);
  });
});

describe("whyFallback: honest, type-specific, never invented", () => {
  test("every Contract 3 arm gets a line that states what the row IS", () => {
    const types = [
      "ops_task", "grant_requirement", "compliance_item", "acknowledgment",
      "reconciliation_item", "document_renewal", "metric_stale",
      "application_pending", "session_unrecorded",
    ];
    for (const type of types) {
      const line = whyFallback(row({ type }), TODAY);
      expect(line.length, type).toBeGreaterThan(10);
    }
  });

  test("due phrasing is honest: was due / due today / due future / no due date", () => {
    expect(whyFallback(row({ type: "grant_requirement", due_date: "2026-09-01" }), TODAY)).toContain(
      "was due 2026-09-01",
    );
    expect(whyFallback(row({ type: "grant_requirement", due_date: TODAY }), TODAY)).toContain("due today");
    expect(whyFallback(row({ type: "grant_requirement", due_date: "2026-09-20" }), TODAY)).toContain(
      "due 2026-09-20",
    );
    expect(whyFallback(row({ type: "ops_task" }), TODAY)).toContain("no due date");
  });

  test("an ops task admits no reason was recorded — the fallback never fakes a stake", () => {
    expect(whyFallback(row({ type: "ops_task" }), TODAY)).toContain("No reason recorded");
    expect(whyFallback(row({ type: "ops_task", state: "blocked" }), TODAY)).toContain("blocked");
  });

  test("an unknown future arm falls back to its module, honestly", () => {
    expect(whyFallback(row({ type: "new_arm", module: "finance" }), TODAY)).toContain("Filed under finance");
  });
});
