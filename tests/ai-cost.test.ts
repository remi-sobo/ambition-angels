import { describe, expect, test } from "vitest";
import { estimateCostUsd, pricingFor } from "@/lib/ai/cost";

describe("estimateCostUsd", () => {
  test("prices Sonnet at $3/M in, $15/M out (matches the prior Reed numbers)", () => {
    // 1M input + 1M output = 3 + 15
    expect(estimateCostUsd("claude-sonnet-4-6", 1_000_000, 1_000_000)).toBeCloseTo(18, 9);
  });

  test("prices Opus at $15/M in, $75/M out (matches the prior funder numbers)", () => {
    expect(estimateCostUsd("claude-opus-4-7", 1_000_000, 1_000_000)).toBeCloseTo(90, 9);
    expect(estimateCostUsd("claude-opus-4-8", 1_000_000, 1_000_000)).toBeCloseTo(90, 9);
  });

  test("reproduces a small real Reed-style estimate exactly", () => {
    // 12,000 in + 800 out on Sonnet = (12000*3 + 800*15) / 1e6
    expect(estimateCostUsd("claude-sonnet-4-6", 12_000, 800)).toBeCloseTo((12_000 * 3 + 800 * 15) / 1_000_000, 12);
  });

  test("falls back to Sonnet pricing for an unknown model (never over-bills)", () => {
    expect(estimateCostUsd("some-future-model", 1_000_000, 1_000_000)).toBeCloseTo(18, 9);
    expect(pricingFor("some-future-model")).toEqual({ inputPerMillionUsd: 3, outputPerMillionUsd: 15 });
  });

  test("zero tokens cost nothing", () => {
    expect(estimateCostUsd("claude-sonnet-4-6", 0, 0)).toBe(0);
  });
});
