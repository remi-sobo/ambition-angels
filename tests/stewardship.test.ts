import { describe, expect, test } from "vitest";

import { complianceFor, complianceBlock, type ReceiptGift } from "../lib/fundraising/receipt";
import {
  evaluateStewardship,
  decideImportStatus,
  ageInDays,
  type StewardshipRule,
  type GiftFacts,
} from "../lib/fundraising/stewardship";

// Mirrors the seeded AA matrix (ack_v2_4_seed_aa_stewardship.sql), rank-ordered.
const RULES: StewardshipRule[] = [
  { id: "r1", name: "first gift", rank: 10, conditions: { first_gift: true, max_age_days: 30 }, action: "create_task_and_draft", channel: "call", template_id: null, sla_hours: 48, assignee: "shannon" },
  { id: "r2", name: "major", rank: 20, conditions: { min_amount: 1000, max_age_days: 30 }, action: "create_task", channel: "call", template_id: null, sla_hours: 24, assignee: "remi" },
  { id: "r3", name: "in-kind", rank: 30, conditions: { methods: ["in_kind"], max_age_days: 30 }, action: "create_task", channel: "letter", template_id: null, sla_hours: 72, assignee: "shannon" },
  { id: "r4", name: "receipt", rank: 40, conditions: { min_amount: 250, max_age_days: 30 }, action: "create_task", channel: "email", template_id: null, sla_hours: 48, assignee: "shannon" },
  { id: "r5", name: "auto", rank: 50, conditions: { min_amount: 0.01, max_age_days: 30 }, action: "auto_email", channel: "email", template_id: null, sla_hours: 0, assignee: null },
];

const facts = (over: Partial<GiftFacts>): GiftFacts => ({
  amount: 100,
  method: "card",
  gift_date: "2026-06-20",
  external_source: "manual",
  recurring: false,
  isFirstGift: false,
  ageDays: 1,
  ...over,
});

describe("complianceFor — the no-wrong-record guard", () => {
  const gift: ReceiptGift = { amount: 300, gift_date: "2026-06-01", method: "check", fair_market_value: null, deductible_amount: null };

  test("a real gift gets the 501(c)(3) receipt language", () => {
    expect(complianceFor(gift)).toContain("501(c)(3)");
    expect(complianceFor(gift)).toBe(complianceBlock(gift));
  });

  test("a non-gift acknowledgment (DAF grant, volunteer, milestone) gets nothing", () => {
    expect(complianceFor(null)).toBe("");
    expect(complianceFor(undefined)).toBe("");
  });

  test("no tax-deductible language is ever produced without a gift", () => {
    expect(complianceFor(null)).not.toContain("deductible");
  });
});

describe("evaluateStewardship — first match wins, by rank", () => {
  test("a recent first gift routes to the personal call", () => {
    const d = evaluateStewardship(facts({ isFirstGift: true, amount: 100 }), RULES);
    expect(d.action).toBe("create_task_and_draft");
    expect(d.channel).toBe("call");
    expect(d.assignee).toBe("shannon");
  });

  test("a $1,000 gift (not first) routes to Remi", () => {
    const d = evaluateStewardship(facts({ amount: 1000 }), RULES);
    expect(d.ruleName).toBe("major");
    expect(d.assignee).toBe("remi");
  });

  test("a $300 gift is an IRS-receipt task", () => {
    const d = evaluateStewardship(facts({ amount: 300 }), RULES);
    expect(d.action).toBe("create_task");
    expect(d.channel).toBe("email");
  });

  test("a small recent gift auto-sends a receipt, no task", () => {
    const d = evaluateStewardship(facts({ amount: 25 }), RULES);
    expect(d.action).toBe("auto_email");
  });

  test("an in-kind gift routes to a letter regardless of amount", () => {
    const d = evaluateStewardship(facts({ amount: 50, method: "in_kind" }), RULES);
    expect(d.ruleName).toBe("in-kind");
  });

  test("a gift older than the window matches nothing → none", () => {
    const d = evaluateStewardship(facts({ amount: 500, ageDays: 400 }), RULES);
    expect(d.action).toBe("none");
  });

  test("no rules → none (caller supplies its own fallback)", () => {
    expect(evaluateStewardship(facts({ amount: 500 }), []).action).toBe("none");
  });
});

describe("decideImportStatus — bulk, side-effect-free", () => {
  test("a historical (old) import row lands not_required", () => {
    const status = decideImportStatus(
      { amount: 500, method: "check", gift_date: "2020-01-01", external_source: "import", recurring: false, ageDays: 2000 },
      RULES
    );
    expect(status).toBe("not_required");
  });

  test("a recent human-touch row lands pending for the queue", () => {
    const status = decideImportStatus(
      { amount: 300, method: "check", gift_date: "2026-06-20", external_source: "import", recurring: false, ageDays: 2 },
      RULES
    );
    expect(status).toBe("pending");
  });

  test("a recent small row needs no human (auto_email) → not_required for import", () => {
    const status = decideImportStatus(
      { amount: 20, method: "card", gift_date: "2026-06-20", external_source: "import", recurring: false, ageDays: 2 },
      RULES
    );
    expect(status).toBe("not_required");
  });
});

describe("ageInDays", () => {
  test("counts whole days from gift_date to a reference today", () => {
    expect(ageInDays("2026-06-20", "2026-06-27")).toBe(7);
    expect(ageInDays("2026-06-27", "2026-06-27")).toBe(0);
  });
});
