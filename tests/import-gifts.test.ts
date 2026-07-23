import { describe, expect, test } from "vitest";

import {
  normalizeGiftMethod,
  giftDedupeKey,
  emptyReconciliation,
  addToReconciliation,
  mergeReconciliation,
} from "../lib/fundraising/import-gifts";
import { buildEscalationTaskInsert } from "../lib/fundraising/ack-tasks";

describe("normalizeGiftMethod — CRM-export spellings land on spine methods", () => {
  test("Network for Good / processor spellings", () => {
    expect(normalizeGiftMethod("Credit Card")).toBe("card");
    expect(normalizeGiftMethod("credit/debit")).toBe("card");
    expect(normalizeGiftMethod("PayPal")).toBe("card");
    expect(normalizeGiftMethod("Cheque")).toBe("check");
    expect(normalizeGiftMethod("EFT")).toBe("ach");
    expect(normalizeGiftMethod("Bank Transfer")).toBe("ach");
    expect(normalizeGiftMethod("In-Kind")).toBe("in_kind");
    expect(normalizeGiftMethod("Securities")).toBe("stock");
  });

  test("spine methods pass through; unknown and empty land 'other'", () => {
    expect(normalizeGiftMethod("check")).toBe("check");
    expect(normalizeGiftMethod("in_kind")).toBe("in_kind");
    expect(normalizeGiftMethod("carrier pigeon")).toBe("other");
    expect(normalizeGiftMethod("")).toBe("other");
  });
});

describe("giftDedupeKey — the re-run idempotency key", () => {
  test("same (constituent, date, amount) collides regardless of float noise", () => {
    expect(giftDedupeKey("c1", "2025-04-01", 100)).toBe(giftDedupeKey("c1", "2025-04-01", 100.0));
    expect(giftDedupeKey("c1", "2025-04-01", 100.1)).toBe(giftDedupeKey("c1", "2025-04-01", 100.1));
  });

  test("different donor, date, or amount does not collide", () => {
    const base = giftDedupeKey("c1", "2025-04-01", 100);
    expect(giftDedupeKey("c2", "2025-04-01", 100)).not.toBe(base);
    expect(giftDedupeKey("c1", "2025-04-02", 100)).not.toBe(base);
    expect(giftDedupeKey("c1", "2025-04-01", 100.01)).not.toBe(base);
  });
});

describe("reconciliation report — per-year totals to check against the source system", () => {
  test("buckets by gift year, sorted, with inserted vs duplicate split", () => {
    const r = emptyReconciliation();
    addToReconciliation(r, "2025-06-01", 100, "inserted");
    addToReconciliation(r, "2024-01-15", 250.5, "inserted");
    addToReconciliation(r, "2025-11-30", 50, "duplicate");
    expect(r.years.map((y) => y.year)).toEqual(["2024", "2025"]);
    expect(r.years[1]).toEqual({ year: "2025", inserted: 1, insertedAmount: 100, duplicates: 1, duplicateAmount: 50 });
    expect(r.inserted).toBe(2);
    expect(r.insertedAmount).toBe(350.5);
    expect(r.duplicates).toBe(1);
  });

  test("merge accumulates across batches without float drift", () => {
    const a = emptyReconciliation();
    addToReconciliation(a, "2025-01-01", 0.1, "inserted");
    const b = emptyReconciliation();
    addToReconciliation(b, "2025-02-01", 0.2, "inserted");
    mergeReconciliation(a, b);
    expect(a.insertedAmount).toBe(0.3);
    expect(a.years).toHaveLength(1);
    expect(a.years[0].inserted).toBe(2);
  });
});

describe("buildEscalationTaskInsert — rule-driven copy for additive tasks", () => {
  const gift = {
    orgId: "org", createdBy: "remi", giftId: "g1", constituentId: "c1",
    donorName: "Ada Lovelace", amount: 100, giftDate: "2026-07-01", assignee: "susan",
  };

  test("without a rule name it keeps the classic major-gift copy", () => {
    const t = buildEscalationTaskInsert(gift);
    expect(t.title).toBe("Personally thank Ada Lovelace for their $100 major gift");
    expect(t.description).toContain("acknowledge personally");
  });

  test("a named rule titles the task as itself, with the template as description", () => {
    const t = buildEscalationTaskInsert({
      ...gift,
      ruleName: "Youth handwritten note (SYAB)",
      noteBody: "Queue this donor for a handwritten note from the Youth Action Board.",
    });
    expect(t.title).toBe("Youth handwritten note (SYAB): Ada Lovelace ($100 gift)");
    expect(t.description).toBe("Queue this donor for a handwritten note from the Youth Action Board.");
  });

  test("an empty template body falls back to the default description", () => {
    const t = buildEscalationTaskInsert({ ...gift, ruleName: "Extra touch", noteBody: "  " });
    expect(t.description).toContain("acknowledge personally");
  });
});
