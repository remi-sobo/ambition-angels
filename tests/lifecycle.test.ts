import { describe, expect, test } from "vitest";
import {
  deriveLifecycleStage,
  MAJOR_DONOR_THRESHOLD,
  type LifecycleInputs,
} from "../lib/fundraising/lifecycle";

// Inputs with sensible defaults; override per case.
const inputs = (p: Partial<LifecycleInputs>): LifecycleInputs => ({
  giftCount: 0,
  lifetimeAmount: 0,
  hasActiveRecurringPlan: false,
  ...p,
});

describe("deriveLifecycleStage", () => {
  test("no gifts, no plan → prospect", () => {
    expect(deriveLifecycleStage(inputs({}))).toBe("prospect");
  });

  test("exactly one gift → first_time", () => {
    expect(deriveLifecycleStage(inputs({ giftCount: 1, lifetimeAmount: 50 }))).toBe("first_time");
  });

  test("two gifts → repeat (first_time/repeat boundary)", () => {
    expect(deriveLifecycleStage(inputs({ giftCount: 2, lifetimeAmount: 100 }))).toBe("repeat");
  });

  test("many gifts, still under major → repeat", () => {
    expect(deriveLifecycleStage(inputs({ giftCount: 600, lifetimeAmount: 9999.99 }))).toBe("repeat");
  });

  test("active recurring plan → recurring", () => {
    expect(
      deriveLifecycleStage(inputs({ giftCount: 5, lifetimeAmount: 500, hasActiveRecurringPlan: true }))
    ).toBe("recurring");
  });

  test("lifetime at the threshold → major (boundary is inclusive)", () => {
    expect(deriveLifecycleStage(inputs({ giftCount: 1, lifetimeAmount: MAJOR_DONOR_THRESHOLD }))).toBe("major");
  });

  test("a cent under the threshold is not major", () => {
    expect(
      deriveLifecycleStage(inputs({ giftCount: 3, lifetimeAmount: MAJOR_DONOR_THRESHOLD - 0.01 }))
    ).toBe("repeat");
  });

  // Precedence boundaries, top down.
  test("major beats recurring", () => {
    expect(
      deriveLifecycleStage(
        inputs({ giftCount: 12, lifetimeAmount: MAJOR_DONOR_THRESHOLD, hasActiveRecurringPlan: true })
      )
    ).toBe("major");
  });

  test("recurring beats repeat", () => {
    expect(
      deriveLifecycleStage(inputs({ giftCount: 8, lifetimeAmount: 800, hasActiveRecurringPlan: true }))
    ).toBe("recurring");
  });

  test("recurring beats first_time", () => {
    expect(
      deriveLifecycleStage(inputs({ giftCount: 1, lifetimeAmount: 25, hasActiveRecurringPlan: true }))
    ).toBe("recurring");
  });

  test("active plan with no gifts yet (first charge pending) → recurring, not prospect", () => {
    expect(deriveLifecycleStage(inputs({ hasActiveRecurringPlan: true }))).toBe("recurring");
  });

  test("repeat beats first_time (count, not amount, splits them)", () => {
    expect(deriveLifecycleStage(inputs({ giftCount: 2, lifetimeAmount: 1 }))).toBe("repeat");
    expect(deriveLifecycleStage(inputs({ giftCount: 1, lifetimeAmount: 5000 }))).toBe("first_time");
  });
});

describe("MAJOR_DONOR_THRESHOLD", () => {
  test("shared default is $10k", () => {
    expect(MAJOR_DONOR_THRESHOLD).toBe(10000);
  });
});
