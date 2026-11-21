import { beforeEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { fakeDb, type FakeDb } from "./support/fakeDb";
import { OWNED_ENTITIES } from "@/lib/admin/owners";
import { BOARD_VIEWS, columnsForView, filterBoard, isMyAsk, searchOpps, type BoardOpp } from "@/lib/fundraising/pipelineBoard";

/**
 * Owner on Pipeline board cards (approved 2026-11-21): opportunities.owner_id
 * (add_owner_id_opportunities.sql), the B2 assign route extended to
 * `opportunities`, the creator as the default owner, the owner chip on the
 * card and the opportunity detail, and "My asks" on the board itself.
 */

const ORG_A = "00000000-0000-0000-0000-00000000000a";
const ORG_B = "00000000-0000-0000-0000-00000000000b";
const ME = "11111111-1111-4111-8111-111111111111";
const ALEX = "22222222-2222-4222-8222-222222222222";
const BOARD = "33333333-3333-4333-8333-333333333333";
const OUTSIDER = "44444444-4444-4444-8444-444444444444";
const OPP_A1 = "aaaaaaa2-0000-4000-8000-000000000001";
const OPP_A2 = "aaaaaaa2-0000-4000-8000-000000000002";
const OPP_B1 = "bbbbbbb2-0000-4000-8000-000000000001";

const ctxFor = (orgId: string) => ({ userId: ME, email: "me@example.org", orgId, orgName: "Org", role: "owner" as const });

let db: FakeDb;
let ctx: ReturnType<typeof ctxFor> | null = ctxFor(ORG_A);
let perms = new Set<string>(["fundraising.write"]);
const auditMock = vi.fn(async (..._args: unknown[]) => {});

vi.mock("react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react")>();
  return { ...mod, cache: <T,>(fn: T) => fn };
});
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => db.client }));
vi.mock("@/lib/audit", () => ({ audit: (...a: unknown[]) => auditMock(...a) }));
vi.mock("@/lib/admin/auth", () => ({
  getOrgContext: vi.fn(async () => ctx),
  ctxHasPermission: vi.fn(async (_c: unknown, p: string) => perms.has(p)),
  getAdminUser: vi.fn(async () => "Me"),
}));

import { POST as assign } from "@/app/api/admin/assign/[entity]/route";
import { createOpportunity } from "@/lib/fundraising/create-opportunity";

const memberOfBoth = (row: Record<string, unknown>) => row.org_id === ORG_A || row.org_id === ORG_B;

beforeEach(() => {
  ctx = ctxFor(ORG_A);
  perms = new Set(["fundraising.write"]);
  auditMock.mockClear();
  db = fakeDb(
    {
      memberships: [
        { user_id: ME, org_id: ORG_A, role: "owner" },
        { user_id: ME, org_id: ORG_B, role: "owner" },
        { user_id: ALEX, org_id: ORG_A, role: "staff" },
        { user_id: BOARD, org_id: ORG_A, role: "board_viewer" },
        { user_id: OUTSIDER, org_id: ORG_B, role: "staff" },
      ],
      opportunities: [
        { id: OPP_A1, org_id: ORG_A, stage: "cultivate", owner: "Remi", owner_id: null },
        { id: OPP_A2, org_id: ORG_A, stage: "solicit", owner: null, owner_id: ME },
        { id: OPP_B1, org_id: ORG_B, stage: "cultivate", owner: null, owner_id: null },
      ],
      pipelines: [],
      pipeline_stages: [],
    },
    { visible: { opportunities: memberOfBoth, memberships: memberOfBoth } },
  );
});

const assignReq = (body: unknown) =>
  assign(new NextRequest("http://localhost/api/admin/assign/opportunities", { method: "POST", body: JSON.stringify(body) }), {
    params: { entity: "opportunities" },
  });

describe("POST /api/admin/assign/opportunities", () => {
  test("opportunities is an owned entity gated on fundraising.write", () => {
    expect(OWNED_ENTITIES.opportunities.permission).toBe("fundraising.write");
  });

  test("assigns a board card to a member of the active org, and audits it", async () => {
    const res = await assignReq({ ids: [OPP_A1], owner_id: ALEX });
    expect(res.status).toBe(200);
    expect(db.tables.opportunities.find((o) => o.id === OPP_A1)!.owner_id).toBe(ALEX);
    // The free-text owner is left as it was; owner_id now wins on the chip.
    expect(db.tables.opportunities.find((o) => o.id === OPP_A1)!.owner).toBe("Remi");
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock.mock.calls[0][1]).toMatchObject({ action: "assign.opportunities.owner", entityType: "opportunities", entityId: OPP_A1 });
  });

  test("without fundraising.write: 403 and no write", async () => {
    perms = new Set(["program.write", "ops.write"]);
    expect((await assignReq({ ids: [OPP_A1], owner_id: ALEX })).status).toBe(403);
    expect(db.tables.opportunities.find((o) => o.id === OPP_A1)!.owner_id).toBeNull();
  });

  test("org pin: another org's card the caller can see is skipped, never written", async () => {
    const res = await assignReq({ ids: [OPP_A1, OPP_B1], owner_id: ALEX });
    expect((await res.json()).updated).toBe(1);
    expect(db.tables.opportunities.find((o) => o.id === OPP_B1)!.owner_id).toBeNull();
    expect((await assignReq({ ids: [OPP_B1], owner_id: ALEX })).status).toBe(404);
  });

  test("only an assignable member of the active org: not an outsider, not a board viewer", async () => {
    expect((await assignReq({ ids: [OPP_A1], owner_id: OUTSIDER })).status).toBe(400);
    expect((await assignReq({ ids: [OPP_A1], owner_id: BOARD })).status).toBe(400);
    expect(db.tables.opportunities.find((o) => o.id === OPP_A1)!.owner_id).toBeNull();
  });

  test("null clears it", async () => {
    expect((await assignReq({ ids: [OPP_A2], owner_id: null })).status).toBe(200);
    expect(db.tables.opportunities.find((o) => o.id === OPP_A2)!.owner_id).toBeNull();
  });
});

describe("the creator owns a new board card", () => {
  test("createOpportunity writes owner_id when the caller passes one", async () => {
    const r = await createOpportunity(db.client as never, ORG_A, { constituentId: "c1", owner: "Me", ownerId: ME });
    expect("opportunityId" in r).toBe(true);
    const row = db.tables.opportunities.find((o) => o.constituent_id === "c1")!;
    expect(row.owner_id).toBe(ME);
    expect(row.owner).toBe("Me");
  });

  test("createOpportunity leaves owner_id alone when the caller does not name one", async () => {
    await createOpportunity(db.client as never, ORG_A, { constituentId: "c2" });
    expect("owner_id" in db.tables.opportunities.find((o) => o.constituent_id === "c2")!).toBe(false);
  });

  test("source: the create routes default to the creator", () => {
    const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8");
    const route = read("app", "api", "admin", "opportunities", "route.ts");
    expect(route).toMatch(/const owner = await createOwnerFor\(body, ctx\)/);
    expect(route).toMatch(/ownerId: owner\.ownerId/);
    expect(read("app", "api", "admin", "fundraising", "prospects", "promote", "route.ts")).toMatch(/ownerId: ctx\.userId/);
    // A gift-table ask with a NAMED text owner keeps showing that name.
    const startAsk = read("app", "api", "admin", "fundraising", "gift-tables", "[id]", "placements", "[pid]", "start-ask", "route.ts");
    expect(startAsk).toMatch(/\? undefined\s*: ctx\.userId/);
  });
});

describe("the owner chip on the card and the detail", () => {
  const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8");
  test("board card: OwnerChip for opportunities, falling back to the text owner", () => {
    const src = read("app", "admin", "fundraising", "_components", "PipelineBoardV4.tsx");
    expect(src).toMatch(/<OwnerChip\s+entity="opportunities"[\s\S]*?ownerId=\{opp\.ownerId\}[\s\S]*?fallbackText=\{opp\.owner\}[\s\S]*?variant="compact"/);
  });
  test("opportunity detail: OwnerChip, and the page looks up the card in the ACTIVE org first", () => {
    expect(read("app", "admin", "fundraising", "pipeline", "[id]", "OpportunityDetail.tsx")).toMatch(
      /<OwnerChip\s+entity="opportunities"[\s\S]*?fallbackText=\{opp\.owner\}/,
    );
    expect(read("app", "admin", "fundraising", "pipeline", "[id]", "page.tsx")).toMatch(
      /from\("opportunities"\)[\s\S]*?\.eq\("org_id", ctx\.orgId\)\s*\.eq\("id", params\.id\)/,
    );
  });
  test("Today's mine reads opportunities.owner_id before the text owner", () => {
    const src = read("lib", "admin", "todayRole.ts");
    expect(src).toMatch(/owner, owner_id, ask_amount, stage/);
    expect(src).toMatch(/isMine\(\{ owner_id: o\.owner_id, owner_text: o\.owner \}, me\)/);
    expect(src).toMatch(/\.or\(`owner_id\.eq\.\$\{me\.userId\},and\(owner_id\.is\.null,owner\.ilike\.\$\{handle\}\)`\)/);
  });
});

describe("My asks on the board", () => {
  const TODAY = "2026-11-21";
  const typeOf = (s: string) => (s === "won" ? "won" : "open");
  const opp = (o: Partial<BoardOpp>): BoardOpp => ({
    id: "x", label: "Ask", constituentName: "Donor", stage: "cultivate", askAmount: 100, expectedClose: null,
    nextStep: null, nextStepDue: null, owner: null, ownerId: null, ...o,
  });
  const me = { userId: ME, handle: "Remi" };
  const opps = [
    opp({ id: "byId", ownerId: ME }),
    opp({ id: "byText", owner: "remi" }), // no owner_id: the handle counts
    opp({ id: "reassigned", ownerId: ALEX, owner: "Remi" }), // owner_id wins over a stale handle
    opp({ id: "other", owner: "Kendra" }),
    opp({ id: "nobody" }),
    opp({ id: "wonMine", stage: "won", ownerId: ME }),
  ];
  const ids = (xs: BoardOpp[]) => xs.map((o) => o.id);

  test("is a built-in view, second after All asks", () => {
    expect(BOARD_VIEWS.map((v) => v.key)).toEqual(["all", "mine", "open", "quarter"]);
    expect(BOARD_VIEWS[1].label).toBe("My asks");
  });

  test("owner_id = me, the text owner only where owner_id is null (Stage C isMine)", () => {
    expect(ids(filterBoard(opps, { view: "mine", quick: [], q: "", me }, typeOf, TODAY))).toEqual(["byId", "byText", "wonMine"]);
    expect(isMyAsk(opps[2], me)).toBe(false);
  });

  test("no viewer means nothing, never everyone's", () => {
    expect(filterBoard(opps, { view: "mine", quick: [], q: "" }, typeOf, TODAY)).toEqual([]);
  });

  test("keeps every column, like All asks", () => {
    const stages = [
      { key: "cultivate", label: "Cultivate", stageType: "open" },
      { key: "won", label: "Won", stageType: "won" },
    ];
    expect(columnsForView(stages, "mine").map((s) => s.key)).toEqual(["cultivate", "won"]);
  });

  test("search also matches the resolved member name", () => {
    expect(ids(searchOpps([{ ...opp({ id: "k", ownerId: ALEX }), ownerName: "Alex Park" }], "alex"))).toEqual(["k"]);
  });
});
