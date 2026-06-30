import { describe, expect, test } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logAICall, monthToDateSpendUsd, startOfUtcMonth } from "@/lib/ai/ledger";
import { mockSupabase } from "./support/supabaseMock";

describe("logAICall", () => {
  test("maps a record onto the ai_calls row, rounding tokens and cost", async () => {
    const { client, calls } = mockSupabase([{ error: null }]);
    await logAICall(client as unknown as SupabaseClient, {
      orgId: "org-1",
      surface: "reed",
      model: "claude-sonnet-4-6",
      tokensInput: 1200.6,
      tokensOutput: 80.2,
      costUsd: 0.0036123456,
      triggeredBy: "remi@ambitionangels.org",
    });
    expect(calls.from).toEqual(["ai_calls"]);
    expect(calls.insert).toHaveLength(1);
    expect(calls.insert[0]).toMatchObject({
      org_id: "org-1",
      surface: "reed",
      triggered_by: "remi@ambitionangels.org",
      model_used: "claude-sonnet-4-6",
      tokens_input: 1201,
      tokens_output: 80,
      cost_usd: 0.003612,
      status: "success",
      metadata: {},
    });
  });

  test("never throws when the insert errors", async () => {
    const { client } = mockSupabase([{ error: { message: "no such table" } }]);
    await expect(
      logAICall(client as unknown as SupabaseClient, {
        orgId: "org-1",
        surface: "career",
        model: "claude-sonnet-4-6",
        tokensInput: 10,
        tokensOutput: 5,
        costUsd: 0.0001,
      }),
    ).resolves.toBeUndefined();
  });
});

describe("monthToDateSpendUsd", () => {
  test("sums cost_usd across the org's rows", async () => {
    const { client, calls } = mockSupabase([
      { data: [{ cost_usd: 1.5 }, { cost_usd: 2.25 }, { cost_usd: null }] },
    ]);
    const total = await monthToDateSpendUsd(client as unknown as SupabaseClient, "org-1");
    expect(total).toBeCloseTo(3.75, 9);
    expect(calls.from).toEqual(["ai_calls"]);
    expect(calls.eq).toContainEqual(["org_id", "org-1"]);
  });

  test("narrows by surface when given", async () => {
    const { client, calls } = mockSupabase([{ data: [{ cost_usd: 5 }] }]);
    const total = await monthToDateSpendUsd(client as unknown as SupabaseClient, "org-1", "reed");
    expect(total).toBe(5);
    expect(calls.eq).toContainEqual(["surface", "reed"]);
  });

  test("returns 0 on a read error", async () => {
    const { client } = mockSupabase([{ error: { message: "boom" } }]);
    expect(await monthToDateSpendUsd(client as unknown as SupabaseClient, "org-1")).toBe(0);
  });
});

describe("startOfUtcMonth", () => {
  test("is the first instant of the month in UTC", () => {
    expect(startOfUtcMonth(new Date("2026-06-30T17:45:00Z"))).toBe("2026-06-01T00:00:00.000Z");
  });
});
