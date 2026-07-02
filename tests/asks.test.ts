import { describe, expect, test } from "vitest";
import {
  computeAskStats,
  isAskForm,
  isAskStatus,
  isAllowedAskDocMime,
  askStatusTone,
  ASK_FORM_VALUES,
  ASK_STATUS_VALUES,
  type AskForStats,
} from "../lib/fundraising/asks";

const ask = (p: Partial<AskForStats>): AskForStats => ({
  status: "draft",
  amount_requested: null,
  amount_committed: null,
  ...p,
});

describe("computeAskStats", () => {
  test("empty log has a null win rate (nothing decided)", () => {
    const s = computeAskStats([]);
    expect(s.total).toBe(0);
    expect(s.outstanding).toBe(0);
    expect(s.committed).toBe(0);
    expect(s.winRate).toBeNull();
  });

  test("outstanding sums requested across open asks only", () => {
    const s = computeAskStats([
      ask({ status: "draft", amount_requested: 1000 }),
      ask({ status: "submitted", amount_requested: 2000 }),
      ask({ status: "pending", amount_requested: 3000 }),
      // Decided asks never count toward outstanding.
      ask({ status: "awarded", amount_requested: 9000, amount_committed: 9000 }),
      ask({ status: "declined", amount_requested: 5000 }),
    ]);
    expect(s.outstanding).toBe(6000);
    expect(s.openCount).toBe(3);
  });

  test("committed sums amount_committed across won asks (awarded + partial)", () => {
    const s = computeAskStats([
      ask({ status: "awarded", amount_committed: 5000 }),
      ask({ status: "partial", amount_committed: 1500 }),
      ask({ status: "declined", amount_committed: 0 }),
    ]);
    expect(s.committed).toBe(6500);
    expect(s.wonCount).toBe(2);
  });

  test("win rate = won / decided; open asks are excluded from the denominator", () => {
    const s = computeAskStats([
      ask({ status: "awarded" }),
      ask({ status: "partial" }),
      ask({ status: "declined" }),
      ask({ status: "withdrawn" }),
      ask({ status: "pending" }), // open — not decided
    ]);
    expect(s.decidedCount).toBe(4);
    expect(s.wonCount).toBe(2);
    expect(s.winRate).toBeCloseTo(0.5, 10);
  });

  test("null amounts contribute zero, not NaN", () => {
    const s = computeAskStats([
      ask({ status: "pending", amount_requested: null }),
      ask({ status: "awarded", amount_committed: null }),
    ]);
    expect(s.outstanding).toBe(0);
    expect(s.committed).toBe(0);
  });
});

describe("validation guards", () => {
  test("isAskForm accepts every declared form and rejects junk", () => {
    for (const f of ASK_FORM_VALUES) expect(isAskForm(f)).toBe(true);
    expect(isAskForm("nope")).toBe(false);
    expect(isAskForm(null)).toBe(false);
  });

  test("isAskStatus accepts every declared status and rejects junk", () => {
    for (const s of ASK_STATUS_VALUES) expect(isAskStatus(s)).toBe(true);
    expect(isAskStatus("cancelled")).toBe(false);
    expect(isAskStatus(42)).toBe(false);
  });
});

describe("document mime allow-list", () => {
  test("PDF and common packet formats pass; executables don't", () => {
    expect(isAllowedAskDocMime("application/pdf")).toBe(true);
    expect(isAllowedAskDocMime("image/png")).toBe(true);
    expect(
      isAllowedAskDocMime("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    ).toBe(true);
    expect(isAllowedAskDocMime("application/x-msdownload")).toBe(false);
    expect(isAllowedAskDocMime("")).toBe(false);
  });
});

describe("askStatusTone", () => {
  test("maps statuses to the four UI tones", () => {
    expect(askStatusTone("draft")).toBe("open");
    expect(askStatusTone("pending")).toBe("open");
    expect(askStatusTone("awarded")).toBe("won");
    expect(askStatusTone("partial")).toBe("won");
    expect(askStatusTone("declined")).toBe("lost");
    expect(askStatusTone("withdrawn")).toBe("lost");
  });
});
