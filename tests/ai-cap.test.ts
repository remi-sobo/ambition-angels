import { afterEach, describe, expect, test } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { orgMonthlyCapUsd, orgOverAICap } from "@/lib/ai/cap";
import { mockSupabase } from "./support/supabaseMock";

const ORIGINAL = process.env.ORG_MONTHLY_AI_CAP_USD;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ORG_MONTHLY_AI_CAP_USD;
  else process.env.ORG_MONTHLY_AI_CAP_USD = ORIGINAL;
});

describe("orgMonthlyCapUsd", () => {
  test("defaults to 100 when unset or invalid", () => {
    delete process.env.ORG_MONTHLY_AI_CAP_USD;
    expect(orgMonthlyCapUsd()).toBe(100);
    process.env.ORG_MONTHLY_AI_CAP_USD = "not-a-number";
    expect(orgMonthlyCapUsd()).toBe(100);
    process.env.ORG_MONTHLY_AI_CAP_USD = "-5";
    expect(orgMonthlyCapUsd()).toBe(100);
  });

  test("honors a valid env override", () => {
    process.env.ORG_MONTHLY_AI_CAP_USD = "250";
    expect(orgMonthlyCapUsd()).toBe(250);
  });
});

describe("orgOverAICap", () => {
  test("under the default cap is not over", async () => {
    delete process.env.ORG_MONTHLY_AI_CAP_USD;
    const { client } = mockSupabase([{ data: [{ cost_usd: 30 }, { cost_usd: 12 }] }]);
    const status = await orgOverAICap(client as unknown as SupabaseClient, "org-1");
    expect(status).toEqual({ over: false, spentUsd: 42, capUsd: 100 });
  });

  test("at or over the cap is over", async () => {
    process.env.ORG_MONTHLY_AI_CAP_USD = "40";
    const { client } = mockSupabase([{ data: [{ cost_usd: 40 }] }]);
    const status = await orgOverAICap(client as unknown as SupabaseClient, "org-1");
    expect(status.over).toBe(true);
    expect(status.capUsd).toBe(40);
  });

  test("fails open: a ledger read error reads as $0 spent, never over", async () => {
    process.env.ORG_MONTHLY_AI_CAP_USD = "1";
    const { client } = mockSupabase([{ error: { message: "boom" } }]);
    const status = await orgOverAICap(client as unknown as SupabaseClient, "org-1");
    expect(status).toEqual({ over: false, spentUsd: 0, capUsd: 1 });
  });
});
