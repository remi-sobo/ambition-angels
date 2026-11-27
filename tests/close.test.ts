import { describe, expect, test } from "vitest";
import { buildCloseStats, carryoverOutcomeLabel, deriveOutcome } from "@/lib/admin/ops/close";
import { buildFridayStatus } from "@/lib/admin/ops/statusLine";

const WEEK = "2026-10-26";
const open = { status: "todo", archived_at: null, planned_week: WEEK };

describe("deriveOutcome (from what the task's buttons did)", () => {
  test("done task is done, even if marked partial earlier", () => {
    expect(deriveOutcome({ ...open, status: "done" }, WEEK, null)).toBe("done");
    expect(deriveOutcome({ ...open, status: "done" }, WEEK, "partial")).toBe("done");
  });
  test("explicit partial holds while the task is open", () => {
    expect(deriveOutcome(open, WEEK, "partial")).toBe("partial");
  });
  test("archived is dropped; rolled to a later week is deferred", () => {
    expect(deriveOutcome({ ...open, archived_at: "2026-10-30T00:00:00Z" }, WEEK, null)).toBe("dropped");
    expect(deriveOutcome({ ...open, planned_week: "2026-11-02" }, WEEK, null)).toBe("deferred");
  });
  test("still open in this week is missed", () => {
    expect(deriveOutcome(open, WEEK, null)).toBe("missed");
    expect(deriveOutcome({ ...open, planned_week: null }, WEEK, null)).toBe("missed");
  });
  test("a deleted task reads dropped unless an outcome was saved", () => {
    expect(deriveOutcome(null, WEEK, null)).toBe("dropped");
    expect(deriveOutcome(null, WEEK, "partial")).toBe("partial");
  });
});

describe("buildCloseStats", () => {
  test("counts each outcome and the midweek additions", () => {
    expect(buildCloseStats(["done", "done", "missed", "partial", "deferred", "dropped"], 2)).toEqual({
      committed: 6,
      committed_done: 2,
      partial: 1,
      missed: 1,
      deferred: 1,
      dropped: 1,
      added_midweek: 2,
    });
  });
});

describe("carryoverOutcomeLabel", () => {
  test("only missed and partial carry a Monday label", () => {
    expect(carryoverOutcomeLabel("missed")).toBe("missed last week");
    expect(carryoverOutcomeLabel("partial")).toBe("partly done last week");
    expect(carryoverOutcomeLabel("deferred")).toBeNull();
    expect(carryoverOutcomeLabel(null)).toBeNull();
  });
});

describe("buildFridayStatus against the commit", () => {
  const base = { planned: 9, done: 4, open: 5, followUpsNeeded: 0 };
  test("with a commit, the line counts committed work", () => {
    const s = buildFridayStatus("owner", { ...base, committed: 6, committedDone: 4 });
    expect(s.sentence).toBe("This week: 0 to follow up, 2 still open, 4 of 6 committed done.");
    expect(s.segments.find((x) => x.key === "open")?.flare).toBe(true);
  });
  test("without a commit, the classic line is unchanged", () => {
    const s = buildFridayStatus("owner", base);
    expect(s.sentence).toBe("This week: 0 to follow up, 5 still open, 4 done, 9 planned.");
  });
});
