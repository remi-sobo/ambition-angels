import { beforeEach, describe, expect, test, vi } from "vitest";
import { seededRolePermissions } from "./support/roleSeed";

// The role guard (lib/admin/requirePermission.ts), exercised through the REAL
// getOrgContext / getEntitlements / ctxHasPermission against a fake session
// client seeded with the migrations' own role_permissions rows.

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

import { PERMISSIONS, MODULE_PERMISSIONS, requirePermission, requireModule } from "@/lib/admin/requirePermission";

function membership(org: string, role: string) {
  return { user_id: "u1", org_id: org, role, orgs: { name: org } };
}

beforeEach(() => {
  state.user = { id: "u1", email: "u1@example.org" };
  state.cookie = undefined;
  state.db = {
    memberships: [],
    org_entitlements: [{ org_id: AA, feature_key: "aa.coach", enabled: true }],
    role_permissions: seededRolePermissions(),
  };
});

describe("permission vocabulary", () => {
  test("PERMISSIONS is exactly the set the migrations seed", () => {
    const seeded = new Set(seededRolePermissions().map((r) => r.permission));
    expect(new Set(PERMISSIONS)).toEqual(seeded);
  });

  test("every module maps to seeded permissions", () => {
    const seeded = new Set(seededRolePermissions().map((r) => r.permission));
    for (const { read, write } of Object.values(MODULE_PERMISSIONS)) {
      expect(seeded.has(read)).toBe(true);
      expect(seeded.has(write)).toBe(true);
    }
  });
});

describe("requirePermission", () => {
  test("no session → 401", async () => {
    state.user = null;
    expect(await requirePermission("finance.read")).toMatchObject({ ok: false, status: 401 });
  });

  test("signed in without a membership → 401", async () => {
    expect(await requirePermission("finance.read")).toMatchObject({ ok: false, status: 401 });
  });

  test("owner and admin pass every module's read and write", async () => {
    for (const role of ["owner", "admin"]) {
      state.db.memberships = [membership(AA, role)];
      for (const { read, write } of Object.values(MODULE_PERMISSIONS)) {
        expect((await requirePermission(read)).ok, `${role} ${read}`).toBe(true);
        expect((await requirePermission(write)).ok, `${role} ${write}`).toBe(true);
      }
    }
  });

  test("board_viewer is read-only: board read passes, every write is refused", async () => {
    state.db.memberships = [membership(AA, "board_viewer")];
    expect((await requirePermission("board.read")).ok).toBe(true);
    for (const perm of [
      "board.write",
      "finance.write",
      "program.write",
      "compliance.write",
      "fundraising.write",
      "ops.write",
      "documents.write",
    ] as const) {
      expect(await requirePermission(perm)).toMatchObject({ ok: false, status: 403 });
    }
    for (const perm of ["finance.read", "program.read", "compliance.read", "fundraising.read"] as const) {
      expect(await requirePermission(perm)).toMatchObject({ ok: false, status: 403 });
    }
  });

  test("finance gets finance and compliance read, never program", async () => {
    state.db.memberships = [membership(AA, "finance")];
    expect((await requirePermission("finance.write")).ok).toBe(true);
    expect((await requirePermission("compliance.read")).ok).toBe(true);
    expect(await requirePermission("program.read")).toMatchObject({ ok: false, status: 403 });
    expect(await requirePermission("compliance.write")).toMatchObject({ ok: false, status: 403 });
  });

  test("staff reads finance but cannot write it", async () => {
    state.db.memberships = [membership(AA, "staff")];
    expect((await requireModule("finance", "read")).ok).toBe(true);
    expect(await requireModule("finance", "write")).toMatchObject({ ok: false, status: 403 });
    expect((await requireModule("program", "write")).ok).toBe(true);
  });

  test("an array opens on ANY listed permission", async () => {
    state.db.memberships = [membership(AA, "staff")];
    expect((await requirePermission(["board.write", "program.write"])).ok).toBe(true);
    state.db.memberships = [membership(AA, "board_viewer")];
    expect(await requirePermission(["program.write", "fundraising.write"])).toMatchObject({ status: 403 });
  });

  test("the role comes from the ACTIVE org's membership only", async () => {
    // Owner in SafeSpace, board_viewer in AA: switched into AA, they are read-only.
    state.db.memberships = [membership(SAFESPACE, "owner"), membership(AA, "board_viewer")];
    state.cookie = AA;
    const r = await requirePermission("finance.write");
    expect(r).toMatchObject({ ok: false, status: 403 });
    state.cookie = SAFESPACE;
    const ok = await requirePermission("finance.write");
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.ctx.orgId).toBe(SAFESPACE);
  });

  test("a forged org cookie never grants a foreign org", async () => {
    state.db.memberships = [membership(AA, "board_viewer")];
    state.cookie = "org-someone-else";
    const r = await requirePermission("board.read");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ctx.orgId).toBe(AA);
  });

  test("entitlement option: 402 when the org lacks it, checked before the role", async () => {
    state.db.memberships = [membership(SAFESPACE, "owner")];
    expect(await requirePermission("program.write", { entitlement: "aa.coach" })).toMatchObject({
      ok: false,
      status: 402,
    });
    state.db.memberships = [membership(AA, "board_viewer")];
    expect(await requirePermission("program.write", { entitlement: "aa.coach" })).toMatchObject({
      ok: false,
      status: 403,
    });
    state.db.memberships = [membership(AA, "staff")];
    expect((await requirePermission("program.write", { entitlement: "aa.coach" })).ok).toBe(true);
  });
});
