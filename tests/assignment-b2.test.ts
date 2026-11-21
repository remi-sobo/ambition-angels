import { beforeEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { fakeDb, type FakeDb } from "./support/fakeDb";
import {
  ownerLabel,
  ownerOptions,
  parseOwnerId,
  resolveCreateOwner,
  type OrgMember,
} from "@/lib/admin/owners";
import { parseSegmentDefinition } from "@/lib/fundraising/segments";
import { toDefinition } from "@/lib/fundraising/views";

/**
 * V4 Stage B2: assignment. owner_id on constituents, asks, cohorts and
 * programs; the creator owns what they create; one guarded assign route for
 * the owner chips and the "Assign to…" bulk action. The fake's `visible`
 * predicate plays RLS for a user who belongs to org A and org B.
 */

const ORG_A = "00000000-0000-0000-0000-00000000000a";
const ORG_B = "00000000-0000-0000-0000-00000000000b";
const ME = "11111111-1111-4111-8111-111111111111";
const ALEX = "22222222-2222-4222-8222-222222222222"; // member of A
const BOARD = "33333333-3333-4333-8333-333333333333"; // board viewer in A
const OUTSIDER = "44444444-4444-4444-8444-444444444444"; // member of B only
const DONOR_A1 = "aaaaaaa1-0000-4000-8000-000000000001";
const DONOR_A2 = "aaaaaaa1-0000-4000-8000-000000000002";
const DONOR_B1 = "bbbbbbb1-0000-4000-8000-000000000001";

const ctxFor = (orgId: string) => ({ userId: ME, email: "me@example.org", orgId, orgName: "Org", role: "owner" as const });

let db: FakeDb;
let ctx: ReturnType<typeof ctxFor> | null = ctxFor(ORG_A);
let perms = new Set<string>(["fundraising.write", "program.write"]);

vi.mock("react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react")>();
  return { ...mod, cache: <T,>(fn: T) => fn };
});
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => db.client }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));
vi.mock("@/lib/hubspot/sync-out", () => ({ pushConstituentToHubSpot: vi.fn(async () => {}) }));
vi.mock("@/lib/admin/auth", () => ({
  getOrgContext: vi.fn(async () => ctx),
  ctxHasPermission: vi.fn(async (_c: unknown, p: string) => perms.has(p)),
  isAuthed: vi.fn(async () => !!ctx),
  getAdminUser: vi.fn(async () => "Me"),
}));

import { POST as assign } from "@/app/api/admin/assign/[entity]/route";
import { POST as createConstituent } from "@/app/api/admin/constituents/route";
import { POST as createAsk } from "@/app/api/admin/asks/route";

const memberOfBoth = (row: Record<string, unknown>) => row.org_id === ORG_A || row.org_id === ORG_B;

beforeEach(() => {
  ctx = ctxFor(ORG_A);
  perms = new Set(["fundraising.write", "program.write"]);
  db = fakeDb(
    {
      memberships: [
        { user_id: ME, org_id: ORG_A, role: "owner" },
        { user_id: ME, org_id: ORG_B, role: "owner" },
        { user_id: ALEX, org_id: ORG_A, role: "staff" },
        { user_id: BOARD, org_id: ORG_A, role: "board_viewer" },
        { user_id: OUTSIDER, org_id: ORG_B, role: "staff" },
      ],
      constituents: [
        { id: DONOR_A1, org_id: ORG_A, type: "person", first_name: "Ada", owner_id: null },
        { id: DONOR_A2, org_id: ORG_A, type: "person", first_name: "Ari", owner_id: ME },
        { id: DONOR_B1, org_id: ORG_B, type: "person", first_name: "Bea", owner_id: null },
      ],
      asks: [],
      cohorts: [],
      programs: [],
    },
    { visible: { constituents: memberOfBoth, memberships: memberOfBoth, asks: memberOfBoth } },
  );
});

const assignReq = (entity: string, body: unknown) =>
  assign(new NextRequest(`http://localhost/api/admin/assign/${entity}`, { method: "POST", body: JSON.stringify(body) }), {
    params: { entity },
  });

describe("POST /api/admin/assign/[entity]", () => {
  test("assigns many donors to a member of the active org", async () => {
    const res = await assignReq("constituents", { ids: [DONOR_A1, DONOR_A2], owner_id: ALEX });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, updated: 2 });
    expect(db.tables.constituents.filter((c) => c.owner_id === ALEX).map((c) => c.id).sort()).toEqual([DONOR_A1, DONOR_A2]);
  });

  test("never writes another org's row, even one the caller can see", async () => {
    const res = await assignReq("constituents", { ids: [DONOR_A1, DONOR_B1], owner_id: ALEX });
    expect((await res.json()).updated).toBe(1);
    expect(db.tables.constituents.find((c) => c.id === DONOR_B1)!.owner_id).toBeNull();
    // Only org B ids: nothing in the active org, so a 404 and no write.
    expect((await assignReq("constituents", { ids: [DONOR_B1], owner_id: ALEX })).status).toBe(404);
  });

  test("the new owner must be a member of the ACTIVE org, and not a board viewer", async () => {
    expect((await assignReq("constituents", { ids: [DONOR_A1], owner_id: OUTSIDER })).status).toBe(400);
    expect((await assignReq("constituents", { ids: [DONOR_A1], owner_id: BOARD })).status).toBe(400);
    expect(db.tables.constituents.find((c) => c.id === DONOR_A1)!.owner_id).toBeNull();
  });

  test("null clears the owner", async () => {
    const res = await assignReq("constituents", { ids: [DONOR_A2], owner_id: null });
    expect(res.status).toBe(200);
    expect(db.tables.constituents.find((c) => c.id === DONOR_A2)!.owner_id).toBeNull();
  });

  test("fundraising.write for donors and asks; program.write for cohorts and programs", async () => {
    perms = new Set(["program.write"]);
    expect((await assignReq("constituents", { ids: [DONOR_A1], owner_id: ALEX })).status).toBe(403);
    expect((await assignReq("asks", { ids: [DONOR_A1], owner_id: ALEX })).status).toBe(403);
    perms = new Set(["fundraising.write"]);
    expect((await assignReq("cohorts", { ids: [DONOR_A1], owner_id: ALEX })).status).toBe(403);
    expect((await assignReq("programs", { ids: [DONOR_A1], owner_id: ALEX })).status).toBe(403);
  });

  test("unknown entity is a 404; bad ids or owner are a 400; no org is a 401", async () => {
    expect((await assignReq("gifts", { ids: [DONOR_A1], owner_id: ALEX })).status).toBe(404);
    expect((await assignReq("constituents", { ids: ["nope"], owner_id: ALEX })).status).toBe(400);
    expect((await assignReq("constituents", { ids: [], owner_id: ALEX })).status).toBe(400);
    expect((await assignReq("constituents", { ids: [DONOR_A1], owner_id: "remi" })).status).toBe(400);
    ctx = null;
    expect((await assignReq("constituents", { ids: [DONOR_A1], owner_id: ALEX })).status).toBe(401);
  });
});

describe("the creator owns what they create", () => {
  const post = (handler: (r: NextRequest) => Promise<Response>, url: string, body: unknown) =>
    handler(new NextRequest(`http://localhost${url}`, { method: "POST", body: JSON.stringify(body) }));

  test("a new donor is owned by its creator", async () => {
    const res = await post(createConstituent, "/api/admin/constituents", { first_name: "Nia" });
    expect(res.status).toBe(200);
    const row = db.tables.constituents.find((c) => c.first_name === "Nia")!;
    expect(row.owner_id).toBe(ME);
    expect(row.org_id).toBe(ORG_A);
  });

  test("an explicit owner is kept, never overwritten; an outsider is refused", async () => {
    await post(createConstituent, "/api/admin/constituents", { first_name: "Oli", owner_id: ALEX });
    expect(db.tables.constituents.find((c) => c.first_name === "Oli")!.owner_id).toBe(ALEX);
    await post(createConstituent, "/api/admin/constituents", { first_name: "Pat", owner_id: null });
    expect(db.tables.constituents.find((c) => c.first_name === "Pat")!.owner_id).toBeNull();
    const res = await post(createConstituent, "/api/admin/constituents", { first_name: "Quin", owner_id: OUTSIDER });
    expect(res.status).toBe(400);
    expect(db.tables.constituents.find((c) => c.first_name === "Quin")).toBeUndefined();
  });

  test("a new ask is owned by its creator; the free-text owner stays as before", async () => {
    const res = await post(createAsk, "/api/admin/asks", { funder_id: DONOR_A1, title: "Spring ask" });
    expect(res.status).toBe(200);
    const ask = db.tables.asks[0];
    expect(ask.owner_id).toBe(ME);
    expect(ask.owner).toBe("Me");
  });

  test("source: cohorts and the programs they create default to the creator", () => {
    const cohorts = readFileSync(join(__dirname, "..", "app", "api", "admin", "cohorts", "route.ts"), "utf8");
    expect(cohorts).toMatch(/owner_id: owner\.ownerId/);
    expect(cohorts).toMatch(/findOrCreateProgram\(supabase, ctx\.orgId, body\.program, \{ ownerId: owner\.ownerId \}\)/);
    const programs = readFileSync(join(__dirname, "..", "lib", "admin", "program", "programs.ts"), "utf8");
    expect(programs).toMatch(/owner_id: opts\.ownerId/);
  });
});

describe("owner helpers (pure)", () => {
  const members: OrgMember[] = [
    { userId: ME, name: "Rowan Vale", role: "owner" },
    { userId: ALEX, name: "Alex Park", role: "staff" },
    { userId: BOARD, name: "Bo Board", role: "board_viewer" },
  ];

  test("the chip shows the member's name, then the free-text fallback, then nothing", () => {
    expect(ownerLabel(ALEX, members, "old text")).toBe("Alex Park");
    expect(ownerLabel(null, members, "Jordan (free text)")).toBe("Jordan (free text)");
    expect(ownerLabel(null, members, "  ")).toBeNull();
    expect(ownerLabel(OUTSIDER, members)).toBe("Former member");
  });

  test("the picker lists Unassigned, then members by name, without board viewers", () => {
    expect(ownerOptions(members, ME)).toEqual([
      { value: "", label: "Unassigned" },
      { value: ALEX, label: "Alex Park" },
      { value: ME, label: "Rowan Vale (you)" },
    ]);
  });

  test("create default: explicit owner_id wins (null included), else the creator", () => {
    expect(resolveCreateOwner({}, ME)).toBe(ME);
    expect(resolveCreateOwner(null, ME)).toBe(ME);
    expect(resolveCreateOwner({ owner_id: ALEX }, ME)).toBe(ALEX);
    expect(resolveCreateOwner({ owner_id: null }, ME)).toBeNull();
    expect(resolveCreateOwner({ owner_id: "remi" }, ME)).toBeUndefined();
    expect(parseOwnerId("")).toBeNull();
  });
});

describe("My donors and My asks", () => {
  test("My donors is a view of the list, first in the strip", () => {
    expect(toDefinition({ view: "mine" })).toEqual({ view: "mine" });
  });

  test("Comms refuses a My donors segment: an email must not depend on who presses Send", () => {
    const r = parseSegmentDefinition({ view: "mine" });
    expect(r.ok).toBe(false);
  });

  test("source: the loader narrows My donors to owner_id = the viewer, pinned to the org", () => {
    const src = readFileSync(join(__dirname, "..", "lib", "admin", "donorsFunders.ts"), "utf8");
    expect(src).toMatch(/view === "mine"[\s\S]*?\.eq\("org_id", ctx\.orgId\)\s*\.eq\("owner_id", ctx\.userId\)/);
  });

  test("source: My asks filters the ask log by owner_id = the viewer", () => {
    const src = readFileSync(join(__dirname, "..", "app", "admin", "fundraising", "asks", "AskLog.tsx"), "utf8");
    expect(src).toMatch(/if \(mine\) query = query\.eq\("owner_id", ctx\.userId\)/);
    const page = readFileSync(join(__dirname, "..", "app", "admin", "fundraising", "pipeline", "page.tsx"), "utf8");
    expect(page).toMatch(/mine=\{searchParams\?\.asks === "mine"\}/);
  });
});

describe("gift Delete lives in the per-gift More menu", () => {
  test("Edit stays on the row; Delete is a danger item in a ⋯ menu, synced gifts disabled", () => {
    const src = readFileSync(join(__dirname, "..", "app", "admin", "fundraising", "donors", "_components", "GiftControls.tsx"), "utf8");
    expect(src).toMatch(/<MoreActionsMenu/);
    expect(src).toMatch(/dots="horizontal"/);
    expect(src).toMatch(/label: busy \? "Deleting" : "Delete gift",\s*danger: true,\s*disabled: synced \|\| busy/);
    expect(src).toMatch(/title: "Delete this gift\?"/); // the confirm is kept
    expect(src).not.toMatch(/>\s*Delete\s*</); // no bare Delete button beside Edit
    const profile = readFileSync(join(__dirname, "..", "app", "admin", "fundraising", "donors", "[id]", "DonorProfile.tsx"), "utf8");
    expect(profile).toMatch(/<EditGiftButton giftId=\{g\.id\}[^>]*\/>\s*<GiftRowActions id=\{g\.id\}/);
  });
});
