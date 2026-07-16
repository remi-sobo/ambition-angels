import { beforeEach, describe, expect, test, vi } from "vitest";

// Active-org resolution (core fence C1). The contract under test: a
// bloom_active_org cookie naming an org the user belongs to wins; no cookie,
// or a stale/foreign value, falls back to the OLDEST membership (the query
// orders created_at asc); no memberships → null. This is the runbook step-11
// verify in miniature: land in AA by default, switch by cookie, land back in
// AA when the cookie is cleared.

// Identity shim for React's RSC-only cache — deliberately NOT the real cache,
// which would memoize across test cases.
vi.mock("react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react")>();
  return { ...mod, cache: <T,>(fn: T) => fn };
});

const state = {
  user: null as { id: string; email: string } | null,
  rows: [] as { org_id: string; role: string; orgs: { name: string } }[],
  cookie: undefined as string | undefined,
};

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: (name: string) =>
      name === "bloom_active_org" && state.cookie !== undefined
        ? { name, value: state.cookie }
        : undefined,
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      then: (resolve: (v: { data: unknown }) => void) => resolve({ data: state.rows }),
    };
    return {
      auth: { getUser: async () => ({ data: { user: state.user } }) },
      from: () => chain,
    };
  },
}));

import {
  getOrgContext,
  getUserOrgs,
  resolveActiveMembership,
  ACTIVE_ORG_COOKIE,
} from "@/lib/admin/auth";

const AA = { org_id: "org-aa", role: "owner", orgs: { name: "Ambition Angels" } };
const TEST = { org_id: "org-test", role: "owner", orgs: { name: "Fence Test" } };

beforeEach(() => {
  state.user = { id: "u1", email: "remi@ambitionangels.org" };
  state.rows = [AA, TEST]; // oldest first, as the query orders
  state.cookie = undefined;
});

describe("resolveActiveMembership", () => {
  test("no cookie → oldest membership", () => {
    expect(resolveActiveMembership([AA, TEST], null)).toBe(AA);
  });

  test("cookie naming a held org wins", () => {
    expect(resolveActiveMembership([AA, TEST], "org-test")).toBe(TEST);
  });

  test("stale/foreign cookie is ignored, not an error", () => {
    expect(resolveActiveMembership([AA, TEST], "org-somebody-else")).toBe(AA);
  });

  test("no memberships → null regardless of cookie", () => {
    expect(resolveActiveMembership([], "org-test")).toBeNull();
  });
});

describe("getOrgContext", () => {
  test("cookie name matches the switch route's", () => {
    expect(ACTIVE_ORG_COOKIE).toBe("bloom_active_org");
  });

  test("no session → null; no memberships → null", async () => {
    state.user = null;
    expect(await getOrgContext()).toBeNull();
    state.user = { id: "u1", email: "remi@ambitionangels.org" };
    state.rows = [];
    expect(await getOrgContext()).toBeNull();
  });

  test("defaults to the oldest membership with its org name", async () => {
    const ctx = await getOrgContext();
    expect(ctx?.orgId).toBe("org-aa");
    expect(ctx?.orgName).toBe("Ambition Angels");
    expect(ctx?.role).toBe("owner");
  });

  test("valid cookie switches the whole context", async () => {
    state.cookie = "org-test";
    const ctx = await getOrgContext();
    expect(ctx?.orgId).toBe("org-test");
    expect(ctx?.orgName).toBe("Fence Test");
  });

  test("invalid cookie falls back to the oldest membership", async () => {
    state.cookie = "org-revoked";
    expect((await getOrgContext())?.orgId).toBe("org-aa");
  });
});

describe("getUserOrgs", () => {
  test("maps all memberships for the switcher, oldest first", async () => {
    expect(await getUserOrgs()).toEqual([
      { orgId: "org-aa", orgName: "Ambition Angels", role: "owner" },
      { orgId: "org-test", orgName: "Fence Test", role: "owner" },
    ]);
  });

  test("empty when signed out", async () => {
    state.user = null;
    expect(await getUserOrgs()).toEqual([]);
  });
});
