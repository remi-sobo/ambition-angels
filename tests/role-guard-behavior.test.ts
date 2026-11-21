import { beforeEach, describe, expect, test, vi } from "vitest";
import { isValidElement } from "react";
import { seededRolePermissions } from "./support/roleSeed";

// Behavior proof for pre-SafeSpace hardening item 3: the REAL route handlers
// and the REAL students page, run as each role against a fake session client
// seeded with the migrations' own role_permissions. The service-role client
// is a tripwire: a refused caller must be turned away before it is touched.

vi.mock("react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react")>();
  return { ...mod, cache: <T,>(fn: T) => fn };
});
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: () => {
    throw new Error("redirect");
  },
}));

const AA = "org-aa";
type Row = Record<string, unknown>;
const state = {
  user: { id: "u1", email: "u1@example.org" } as { id: string; email: string } | null,
  db: {} as Record<string, Row[]>,
  serviceRoleCalls: 0,
};

vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined }),
  headers: () => new Headers(),
}));

function fakeClient() {
  return {
    auth: {
        getUser: async () => ({ data: { user: state.user } }),
        // An aal2 access token: these sessions have finished two-step login.
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
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => {
    state.serviceRoleCalls++;
    throw new Error("service-role client touched");
  },
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));

import { DELETE as deleteStudent, PATCH as patchStudent } from "@/app/api/admin/students/[id]/route";
import { PATCH as patchTransaction } from "@/app/api/admin/finance/transactions/[id]/route";
import { PATCH as patchBoardMember, DELETE as deleteBoardMember } from "@/app/api/admin/board/members/[id]/route";
import { PATCH as patchCompliance, DELETE as deleteCompliance } from "@/app/api/admin/compliance/[id]/route";
import { POST as postBoardMeeting } from "@/app/api/admin/board/meetings/route";
import { POST as postFinConfig } from "@/app/api/admin/finance/config/route";
import StudentsPage from "@/app/admin/students/page";
import { NotAuthorized } from "@/app/admin/_components/PermissionGate";

const ID = "11111111-1111-1111-1111-111111111111";

function as(role: string) {
  state.db.memberships = [{ user_id: "u1", org_id: AA, role, orgs: { name: "AA" } }];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const req = (method: string, body: unknown = {}): any =>
  new Request("http://localhost/api/admin/x", {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "DELETE" ? undefined : JSON.stringify(body),
  });
const params = { params: { id: ID } };

const WRITES: [string, () => Promise<Response>][] = [
  ["DELETE students/[id]", () => deleteStudent(req("DELETE"), params)],
  ["PATCH students/[id]", () => patchStudent(req("PATCH", { first_name: "X" }), params)],
  ["PATCH finance/transactions/[id]", () => patchTransaction(req("PATCH", { notes: "x" }), params)],
  ["POST finance/config", () => postFinConfig(req("POST", { cash_on_hand: 1 }))],
  ["PATCH board/members/[id]", () => patchBoardMember(req("PATCH", { name: "X" }), params)],
  ["DELETE board/members/[id]", () => deleteBoardMember(req("DELETE"), params)],
  ["POST board/meetings", () => postBoardMeeting(req("POST", { meeting_date: "2026-12-01" }))],
  ["PATCH compliance/[id]", () => patchCompliance(req("PATCH", { status: "done" }), params)],
  ["DELETE compliance/[id]", () => deleteCompliance(req("DELETE"), params)],
];

beforeEach(() => {
  state.user = { id: "u1", email: "u1@example.org" };
  state.serviceRoleCalls = 0;
  state.db = { memberships: [], role_permissions: seededRolePermissions(), org_entitlements: [] };
});

describe("board_viewer is read-only on the server", () => {
  test.each(WRITES)("%s → 403, service role untouched", async (_name, call) => {
    as("board_viewer");
    const res = await call();
    expect(res.status).toBe(403);
    expect(state.serviceRoleCalls).toBe(0);
  });
});

describe("finance is confined to finance", () => {
  test("finance cannot write students, board or compliance", async () => {
    as("finance");
    for (const [name, call] of WRITES.filter(([n]) => !n.includes("finance/"))) {
      const res = await call();
      expect(res.status, name).toBe(403);
    }
    expect(state.serviceRoleCalls).toBe(0);
  });

  test("finance passes the guard on finance writes (reaches the data layer)", async () => {
    as("finance");
    await patchTransaction(req("PATCH", { notes: "x" }), params).catch(() => null);
    expect(state.serviceRoleCalls).toBe(1);
  });

  test("finance cannot read the student roster: the page refuses before any query", async () => {
    as("finance");
    const el = await StudentsPage();
    expect(isValidElement(el)).toBe(true);
    expect((el as { type: unknown }).type).toBe(NotAuthorized);
    expect(state.serviceRoleCalls).toBe(0);
  });

  test("board_viewer cannot read the student roster either", async () => {
    as("board_viewer");
    const el = await StudentsPage();
    expect((el as { type: unknown }).type).toBe(NotAuthorized);
    expect(state.serviceRoleCalls).toBe(0);
  });
});

describe("owner, admin and staff keep their access", () => {
  test("staff passes the guard on a student write", async () => {
    as("staff");
    await deleteStudent(req("DELETE"), params).catch(() => null);
    expect(state.serviceRoleCalls).toBe(1);
  });

  test("staff is refused board writes (no board.write), as RLS already refuses", async () => {
    as("staff");
    expect((await patchBoardMember(req("PATCH", { name: "X" }), params)).status).toBe(403);
  });

  test("owner and admin pass every guard", async () => {
    for (const role of ["owner", "admin"]) {
      as(role);
      for (const [, call] of WRITES) {
        state.serviceRoleCalls = 0;
        const res = await call().catch(() => null);
        expect(res?.status ?? 0).not.toBe(403);
        expect(res?.status ?? 0).not.toBe(401);
      }
    }
  });

  test("no session → 401", async () => {
    state.user = null;
    expect((await deleteStudent(req("DELETE"), params)).status).toBe(401);
  });
});
