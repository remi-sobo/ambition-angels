import { describe, expect, test, vi, beforeEach } from "vitest";

// Entitlement reader + gates (core fence B1). The contract under test:
// getEntitlements returns exactly the enabled keys, hasFeature treats unknown
// keys as OFF (no code-side defaults — a tenant's key set is seed data), and
// requireEntitlement maps no-session/no-key to 401/402 for route handlers.

const state = {
  rows: [] as { feature_key: string }[],
  ctx: null as { orgId: string } | null,
};

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      // Awaiting the builder resolves the query, like supabase-js.
      then: (resolve: (v: { data: { feature_key: string }[] }) => void) =>
        resolve({ data: state.rows }),
    };
    return { from: () => chain };
  },
}));

vi.mock("@/lib/admin/auth", () => ({
  getOrgContext: vi.fn(async () => state.ctx),
}));

import {
  getEntitlements,
  hasFeature,
  hasEntitlement,
  requireEntitlement,
  FEATURE_KEYS,
} from "@/lib/admin/entitlements";

beforeEach(() => {
  state.rows = [];
  state.ctx = { orgId: "org-1" };
});

describe("entitlement reader", () => {
  test("returns exactly the enabled keys", async () => {
    state.rows = [{ feature_key: "modules.finance" }, { feature_key: "ai.reed" }];
    const ents = await getEntitlements("org-1");
    expect(hasFeature(ents, "modules.finance")).toBe(true);
    expect(hasFeature(ents, "ai.reed")).toBe(true);
  });

  test("unknown/missing keys are off — no code-side defaults", async () => {
    state.rows = [{ feature_key: "modules.finance" }];
    const ents = await getEntitlements("org-1");
    expect(hasFeature(ents, "modules.partners")).toBe(false);
    expect(hasFeature(ents, "aa.demoday")).toBe(false);
    // An org with zero rows sees nothing gated as on.
    state.rows = [];
    const empty = await getEntitlements("org-2");
    for (const key of FEATURE_KEYS) expect(hasFeature(empty, key)).toBe(false);
  });
});

describe("session gates", () => {
  test("hasEntitlement is false without a session", async () => {
    state.ctx = null;
    expect(await hasEntitlement("ai.reed")).toBe(false);
  });

  test("requireEntitlement: 401 unauthenticated, 402 missing key, ok when held", async () => {
    state.ctx = null;
    expect(await requireEntitlement("ai.reed")).toMatchObject({ ok: false, status: 401 });

    state.ctx = { orgId: "org-1" };
    state.rows = [];
    expect(await requireEntitlement("ai.reed")).toMatchObject({ ok: false, status: 402 });

    state.rows = [{ feature_key: "ai.reed" }];
    const ok = await requireEntitlement("ai.reed");
    expect(ok.ok).toBe(true);
  });
});
