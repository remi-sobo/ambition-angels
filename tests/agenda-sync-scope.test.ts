import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeDb, type FakeDb } from "./support/fakeDb";

/**
 * Tenancy fence for the calendar sync. The user-triggered
 * POST /api/admin/agenda/sync runs on the service-role client, so it must sync
 * only the caller's own calendar connection(s) in the ACTIVE org. The all-org
 * sweep stays on the cron path (GET /api/cron/calendar-sync), behind
 * CRON_SECRET. Each sync writes one calendar_sync_jobs row per connection, so
 * the job rows show exactly whose calendars a call touched.
 */

const ORG_A = "00000000-0000-0000-0000-00000000000a";
const ORG_B = "00000000-0000-0000-0000-00000000000b";

type Conn = { id: string; orgId: string; userId: string };
// u1 is connected in both orgs; u2 shares org A; u3 is only in org B.
const CONNS: Conn[] = [
  { id: "c-u1-a", orgId: ORG_A, userId: "u1" },
  { id: "c-u1-b", orgId: ORG_B, userId: "u1" },
  { id: "c-u2-a", orgId: ORG_A, userId: "u2" },
  { id: "c-u3-b", orgId: ORG_B, userId: "u3" },
];

let db: FakeDb;
let ctx: { userId: string; email: string; orgId: string; orgName: string; role: "owner" } | null;
let perms: Set<string>;
const listCalls: unknown[] = [];
const calendarsListed: string[] = [];

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => db.client }));
vi.mock("@/lib/admin/auth", () => ({
  getOrgContext: vi.fn(async () => ctx),
  ctxHasPermission: vi.fn(async (_c: unknown, p: string) => perms.has(p)),
}));
vi.mock("@/lib/google/connection", () => ({
  // Deliberately ignores the scope, so the test proves runCalendarSync itself
  // never widens a user-triggered run (the real lister also filters in SQL).
  listActiveCalendarConnections: vi.fn(async (scope?: unknown) => {
    listCalls.push(scope);
    return CONNS.map((c) => ({
      ...c,
      refreshToken: `rt-${c.id}`,
      calendarId: c.id,
      status: "active",
      syncToken: null,
      watch: null,
    }));
  }),
  calendarClientFromRefreshToken: () => ({
    events: {
      list: async (args: { calendarId: string }) => {
        calendarsListed.push(args.calendarId);
        return { data: { items: [], nextSyncToken: null } };
      },
    },
  }),
  updateConnectionMeta: vi.fn(async () => {}),
}));

import { POST as userSync } from "@/app/api/admin/agenda/sync/route";
import { GET as cronSync } from "@/app/api/cron/calendar-sync/route";

const jobOwners = () =>
  db.inserts
    .filter((i) => i.table === "calendar_sync_jobs")
    .map((i) => `${i.row.owner_user_id}@${i.row.org_id === ORG_A ? "A" : "B"}`)
    .sort();

beforeEach(() => {
  db = fakeDb({ orgs: [{ id: ORG_A, settings: {} }, { id: ORG_B, settings: {} }] });
  ctx = { userId: "u1", email: "u1@example.org", orgId: ORG_A, orgName: "A", role: "owner" };
  perms = new Set(["ops.write"]);
  listCalls.length = 0;
  calendarsListed.length = 0;
  process.env.CRON_SECRET = "s3cret";
});

describe("POST /api/admin/agenda/sync (user-triggered)", () => {
  test("syncs only the caller's own connection in the active org", async () => {
    const res = await userSync();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ users: 1, ok: 1, failed: 0 });
    expect(listCalls).toEqual([{ userId: "u1", orgId: ORG_A }]);
    expect(jobOwners()).toEqual(["u1@A"]);
    expect(calendarsListed).toEqual(["c-u1-a"]);
  });

  test("switching the active org syncs the caller's org-B connection, not org A's", async () => {
    ctx = { ...ctx!, orgId: ORG_B };
    await userSync();
    expect(jobOwners()).toEqual(["u1@B"]);
    expect(calendarsListed).toEqual(["c-u1-b"]);
  });

  test("a caller with no connection in the active org syncs nothing", async () => {
    ctx = { ...ctx!, userId: "u2", orgId: ORG_B };
    expect(await (await userSync()).json()).toEqual({ users: 0, ok: 0, failed: 0 });
    expect(jobOwners()).toEqual([]);
    expect(calendarsListed).toEqual([]);
  });

  test("no session is a 401 and a role without ops.write is a 403; nothing syncs", async () => {
    ctx = null;
    expect((await userSync()).status).toBe(401);
    ctx = { userId: "u1", email: "u1@example.org", orgId: ORG_A, orgName: "A", role: "owner" };
    perms = new Set(["ops.read"]);
    expect((await userSync()).status).toBe(403);
    expect(listCalls).toEqual([]);
    expect(jobOwners()).toEqual([]);
  });
});

describe("GET /api/cron/calendar-sync (cron)", () => {
  const cronReq = (auth?: string) =>
    new NextRequest("http://localhost/api/cron/calendar-sync", {
      headers: auth ? { authorization: auth } : {},
    });

  test("with the cron secret, still sweeps every connection in every org", async () => {
    const res = await cronSync(cronReq("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect((await res.json()).users).toBe(4);
    expect(listCalls).toEqual([undefined]);
    expect(jobOwners()).toEqual(["u1@A", "u1@B", "u2@A", "u3@B"]);
  });

  test("without the cron secret, refuses and syncs nothing", async () => {
    expect((await cronSync(cronReq())).status).toBe(401);
    expect((await cronSync(cronReq("Bearer wrong"))).status).toBe(401);
    expect(listCalls).toEqual([]);
    expect(jobOwners()).toEqual([]);
  });
});
