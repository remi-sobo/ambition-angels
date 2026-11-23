import { beforeEach, describe, expect, test, vi } from "vitest";

// The AA-only guard (lib/admin/aaOnly.ts), exercised through the REAL
// getOrgContext / getEntitlements / ctxHasPermission against a fake session
// client: active-org resolution, the org-scoped entitlement read and the
// role_permissions lookup all run as in production.

vi.mock("react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react")>();
  return { ...mod, cache: <T,>(fn: T) => fn };
});

const AA = "org-aa";
const SAFESPACE = "org-safespace";

type Row = Record<string, unknown>;
const state = {
  user: null as { id: string; email: string } | null,
  cookie: undefined as string | undefined,
  db: {} as Record<string, Row[]>,
};

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: (name: string) =>
      name === "bloom_active_org" && state.cookie !== undefined ? { name, value: state.cookie } : undefined,
  }),
}));

/** Minimal chainable PostgREST stand-in: select/eq/order/maybeSingle/await. */
function fakeClient() {
  return {
    auth: {
        getUser: async () => ({ data: { user: state.user && { ...state.user, factors: [{ status: "verified" }] } } }),
        // A verified factor and an aal2 token: these sessions finished two-step login.
        getSession: async () => ({ data: { session: { access_token: "x.eyJhYWwiOiJhYWwyIn0.s" } } }),
      },
    from(table: string) {
      let rows = [...(state.db[table] ?? [])];
      const q = {
        select: () => q,
        order: () => q,
        eq: (col: string, val: unknown) => {
          rows = rows.filter((r) => r[col] === val);
          return q;
        },
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (res: (v: { data: Row[]; error: null }) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve({ data: rows, error: null }).then(res, rej),
      };
      return q;
    },
  };
}
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => fakeClient() }));

import { requireAaOnly } from "@/lib/admin/aaOnly";
import { sessionOrgHasEntitlement } from "@/lib/admin/activeOrg";
import type { SupabaseClient } from "@supabase/supabase-js";

function membership(org: string, role: string) {
  return { user_id: "u1", org_id: org, role, orgs: { name: org } };
}

beforeEach(() => {
  state.user = { id: "u1", email: "u1@example.org" };
  state.cookie = undefined;
  state.db = {
    memberships: [],
    // AA holds the AA-only keys; SafeSpace holds every generic module,
    // including modules.content, but no aa.* key.
    org_entitlements: [
      { org_id: AA, feature_key: "aa.career_library", enabled: true },
      { org_id: AA, feature_key: "aa.quiz", enabled: true },
      { org_id: SAFESPACE, feature_key: "modules.content", enabled: true },
      { org_id: SAFESPACE, feature_key: "modules.program", enabled: true },
    ],
    // The seeded role → permission rows that matter here.
    role_permissions: [
      { role: "owner", permission: "program.write" },
      { role: "admin", permission: "program.write" },
      { role: "staff", permission: "program.write" },
      { role: "board_viewer", permission: "board.read" },
      { role: "finance", permission: "finance.write" },
    ],
  };
});

describe("requireAaOnly", () => {
  test("no session → 401", async () => {
    state.user = null;
    expect(await requireAaOnly("aa.career_library")).toMatchObject({ ok: false, status: 401 });
  });

  test("signed in but no membership → 401", async () => {
    expect(await requireAaOnly("aa.quiz")).toMatchObject({ ok: false, status: 401 });
  });

  test("wrong org: a SafeSpace owner is denied reads and writes", async () => {
    state.db.memberships = [membership(SAFESPACE, "owner")];
    expect(await requireAaOnly("aa.quiz")).toMatchObject({ ok: false, status: 403 });
    expect(await requireAaOnly("aa.career_library", { write: true })).toMatchObject({ ok: false, status: 403 });
  });

  test("wrong ACTIVE org: an AA member switched into SafeSpace is denied", async () => {
    state.db.memberships = [membership(AA, "owner"), membership(SAFESPACE, "owner")];
    state.cookie = SAFESPACE;
    expect(await requireAaOnly("aa.career_library")).toMatchObject({ ok: false, status: 403 });
    state.cookie = AA;
    expect(await requireAaOnly("aa.career_library")).toMatchObject({ ok: true });
  });

  test("right org, entitlement missing for this surface → 403", async () => {
    state.db.memberships = [membership(AA, "owner")];
    expect(await requireAaOnly("aa.site_analytics")).toMatchObject({ ok: false, status: 403 });
  });

  test("right org and role: AA staff may read and write", async () => {
    state.db.memberships = [membership(AA, "staff")];
    const read = await requireAaOnly("aa.career_library");
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.ctx.orgId).toBe(AA);
    expect((await requireAaOnly("aa.career_library", { write: true })).ok).toBe(true);
  });

  test("AA board_viewer can read but cannot write", async () => {
    state.db.memberships = [membership(AA, "board_viewer")];
    expect((await requireAaOnly("aa.career_library")).ok).toBe(true);
    expect(await requireAaOnly("aa.career_library", { write: true })).toMatchObject({ ok: false, status: 403 });
  });

  test("AA finance role cannot write career content", async () => {
    state.db.memberships = [membership(AA, "finance")];
    expect(await requireAaOnly("aa.career_library", { write: true })).toMatchObject({ ok: false, status: 403 });
  });
});

describe("sessionOrgHasEntitlement (middleware gate for /strategy, /demoday)", () => {
  const client = () => fakeClient() as unknown as SupabaseClient;

  test("active org holding the key passes; another org's member does not", async () => {
    state.db.org_entitlements.push({ org_id: AA, feature_key: "aa.demoday", enabled: true });
    state.db.memberships = [membership(SAFESPACE, "owner")];
    expect(await sessionOrgHasEntitlement(client(), "u1", null, "aa.demoday")).toBe(false);
    state.db.memberships = [membership(AA, "staff")];
    expect(await sessionOrgHasEntitlement(client(), "u1", null, "aa.demoday")).toBe(true);
  });

  test("multi-org user follows the active-org cookie", async () => {
    state.db.org_entitlements.push({ org_id: AA, feature_key: "aa.strategy_room", enabled: true });
    state.db.memberships = [membership(AA, "owner"), membership(SAFESPACE, "owner")];
    expect(await sessionOrgHasEntitlement(client(), "u1", SAFESPACE, "aa.strategy_room")).toBe(false);
    expect(await sessionOrgHasEntitlement(client(), "u1", AA, "aa.strategy_room")).toBe(true);
  });

  test("a disabled entitlement row does not count", async () => {
    state.db.org_entitlements.push({ org_id: AA, feature_key: "aa.demoday", enabled: false });
    state.db.memberships = [membership(AA, "owner")];
    expect(await sessionOrgHasEntitlement(client(), "u1", null, "aa.demoday")).toBe(false);
  });
});
