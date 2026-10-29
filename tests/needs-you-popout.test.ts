import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  OBLIGATION_META,
  afterRemoval,
  isTypingTarget,
  neighborId,
  obligationMeta,
  recordHref,
  snoozeUntil,
} from "@/lib/admin/needsYou";

// specs/needs-you-popout-thank-yous.md, PR 2: the popout registry, record
// links, J/K navigation, and the deferred Done/Snooze with undo.

const TODAY = "2026-10-20";
const row = (type: string, over: Partial<Parameters<typeof recordHref>[0]> = {}) => ({
  type,
  source_id: "src-1",
  related_entity_type: null,
  related_entity_id: null,
  ...over,
});

describe("obligationMeta: a registry, with a fallback for anything unknown", () => {
  test("known types carry a chip label and a record label", () => {
    expect(obligationMeta("ops_task")).toMatchObject({ label: "Task", primaryLabel: "Done" });
    expect(obligationMeta("acknowledgment").primaryLabel).toBe("Mark thanked");
  });
  test("types that resolve on their own screen have no primary action", () => {
    for (const t of ["metric_stale", "session_unrecorded", "document_renewal", "capture", "fr_next_step"]) {
      expect(obligationMeta(t).primaryLabel).toBeUndefined();
    }
  });
  test("an unknown type still gets a shell with Open full record", () => {
    expect(obligationMeta("brand_new_type")).toEqual({ label: "Item", recordLabel: "Open full record" });
  });
  test("every type v_obligations can emit is registered", () => {
    for (const t of [
      "ops_task", "acknowledgment", "grant_requirement", "compliance_item", "fr_next_step", "capture",
      "session_unrecorded", "metric_stale", "document_renewal", "reconciliation_item", "application_pending",
    ]) {
      expect(OBLIGATION_META[t], t).toBeDefined();
    }
  });
});

describe("recordHref: the per-record page, or null for the module fallback", () => {
  test("record pages per type", () => {
    expect(recordHref(row("acknowledgment", { constituent_id: "c1" }))).toBe("/admin/fundraising/donors-funders/c1");
    expect(recordHref(row("compliance_item"))).toBe("/admin/organization/compliance/src-1");
    expect(recordHref(row("grant_requirement", { related_entity_id: "g1" }))).toBe("/admin/fundraising/grants/g1");
    expect(recordHref(row("session_unrecorded", { related_entity_id: "cohort1" }))).toBe(
      "/admin/programs/cohorts/cohort1/sessions/src-1",
    );
    expect(recordHref(row("fr_next_step", { related_entity_id: "c2" }))).toBe("/admin/fundraising/donors-funders/c2");
    expect(recordHref(row("capture"))).toBe("/admin/capture/src-1");
  });
  test("no record page (or a missing link) falls back to null", () => {
    expect(recordHref(row("ops_task"))).toBeNull();
    expect(recordHref(row("metric_stale"))).toBeNull();
    expect(recordHref(row("acknowledgment"))).toBeNull();
    expect(recordHref(row("grant_requirement"))).toBeNull();
  });
});

describe("navigation", () => {
  const ids = ["a", "b", "c"];
  test("J and K move without wrapping", () => {
    expect(neighborId(ids, "a", 1)).toBe("b");
    expect(neighborId(ids, "c", 1)).toBeNull();
    expect(neighborId(ids, "a", -1)).toBeNull();
    expect(neighborId(ids, "x", 1)).toBeNull();
  });
  test("after Done the popout goes to the next item, else the previous, else closes", () => {
    expect(afterRemoval(ids, "a")).toBe("b");
    expect(afterRemoval(ids, "c")).toBe("b");
    expect(afterRemoval(["only"], "only")).toBeNull();
  });
  test("snooze: tomorrow when overdue or due today, else a week out", () => {
    expect(snoozeUntil("2026-10-01", TODAY)).toBe("2026-10-21");
    expect(snoozeUntil(TODAY, TODAY)).toBe("2026-10-21");
    expect(snoozeUntil("2026-10-25", TODAY)).toBe("2026-10-27");
    expect(snoozeUntil(null, TODAY)).toBe("2026-10-27");
  });
  test("shortcut keys are ignored while typing", () => {
    expect(isTypingTarget({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "SELECT" } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "BUTTON" } as unknown as EventTarget)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("wiring fences", () => {
  const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
  test("Done and Snooze are deferred behind the undo window, and a thank-you's Done goes through /mark", () => {
    const hook = read("app", "admin", "today", "_components", "popout", "useDeferredActions.ts");
    expect(hook).toMatch(/UNDO_MS = 5000/);
    expect(hook).toMatch(/\/api\/admin\/acknowledgments\/mark/);
    expect(hook).toMatch(/keepalive/);
    expect(read("app", "admin", "today", "_components", "NeedsYou.tsx")).not.toMatch(/fetch\(/);
  });
});
