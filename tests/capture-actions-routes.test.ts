import { beforeEach, describe, expect, test, vi } from "vitest";
import { CAPTURE_ID, MARISOL, ORG, OWNER, PROSPECT, HARBOR, card, interactionCard, world, type World } from "./support/captureWorld";

// Capture C3 step 7: the three action routes. The session client is the
// in-memory fake; entitlement, permission, and audit are stubbed.

const CTX = { userId: OWNER, email: "remi@example.org", orgId: ORG, orgName: "Org", role: "owner" as const };
let entitled: { ok: true; ctx: typeof CTX } | { ok: false; status: 401 | 402; error: string } = { ok: true, ctx: CTX };
let w: World;
let perms = new Set(["fundraising.write", "program.write", "ops.write"]);
const auditSpy = vi.fn<(entry: unknown) => Promise<void>>(async () => {});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/entitlements", () => ({ requireEntitlement: vi.fn(async () => entitled) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => w.db.client }));
vi.mock("@/lib/audit", () => ({ audit: (_req: unknown, e: unknown) => auditSpy(e) }));
vi.mock("@/lib/admin/auth", () => ({
  getAdminUser: vi.fn(async () => "remi"),
  ctxHasPermission: vi.fn(async (_ctx: unknown, p: string) => perms.has(p)),
}));

import { POST as cardAction } from "@/app/api/admin/capture/cards/[id]/route";
import { POST as confirmAllRoute } from "@/app/api/admin/capture/[id]/confirm-all/route";
import { GET as candidatesRoute } from "@/app/api/admin/capture/candidates/route";
import { NextRequest } from "next/server";

const post = (fn: typeof cardAction, id: string, body?: unknown) =>
  fn(
    new NextRequest(`http://localhost/api/admin/capture/x/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: { id } },
  );

beforeEach(() => {
  entitled = { ok: true, ctx: CTX };
  perms = new Set(["fundraising.write", "program.write", "ops.write"]);
  auditSpy.mockClear();
});

describe("POST /api/admin/capture/cards/[id]", () => {
  test("402 without ai.capture, before reading anything", async () => {
    const c = card();
    w = world([c]);
    entitled = { ok: false, status: 402, error: "upgrade" };
    const res = await post(cardAction, c.id, { action: "confirm" });
    expect(res.status).toBe(402);
    expect(w.db.tables.ops_tasks).toHaveLength(0);
  });

  test("bad input is a 400: unknown action, bad JSON, edit without patch, patch on undo, over-limit text", async () => {
    const c = card();
    w = world([c]);
    expect((await post(cardAction, c.id, { action: "send" })).status).toBe(400);
    expect((await post(cardAction, c.id, "{not json")).status).toBe(400);
    expect((await post(cardAction, c.id, { action: "edit" })).status).toBe(400);
    expect((await post(cardAction, c.id, { action: "undo", patch: { title: "x" } })).status).toBe(400);
    expect((await post(cardAction, c.id, { action: "edit", patch: { title: "x".repeat(20001) } })).status).toBe(400);
    expect((await post(cardAction, c.id, { action: "edit", patch: { status: "confirmed" } })).status).toBe(400);
  });

  test("a non-uuid or invisible card is a 404", async () => {
    w = world([]);
    expect((await post(cardAction, "nope", { action: "confirm" })).status).toBe(404);
    expect((await post(cardAction, "00000000-0000-0000-0000-0000000000aa", { action: "confirm" })).status).toBe(404);
  });

  test("confirm -> 200 { card, applied }, with an audit row; undo -> 200 and the row is gone", async () => {
    const c = interactionCard();
    w = world([c]);
    const res = await post(cardAction, c.id, { action: "confirm" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.card.status).toBe("confirmed");
    expect(body.applied).toEqual({ table: "interactions", id: w.db.tables.interactions[0].id });
    expect(w.db.tables.interactions[0].logged_by).toBe("remi");
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({ action: "capture.interaction.create" }));

    const undo = await post(cardAction, c.id, { action: "undo" });
    expect(undo.status).toBe(200);
    expect((await undo.json()).card.status).toBe("proposed");
    expect(w.db.tables.interactions).toHaveLength(0);
  });

  test("confirm with a pick files a held card", async () => {
    const c = interactionCard({ status: "held", entity_type: null, entity_id: null });
    w = world([c]);
    const res = await post(cardAction, c.id, { action: "confirm", patch: { entity: { type: "constituent", id: MARISOL } } });
    expect(res.status).toBe(200);
    expect(w.db.tables.interactions).toHaveLength(1);
  });

  test("missing destination permission is a 403 naming it", async () => {
    const c = interactionCard();
    w = world([c]);
    perms = new Set(["ops.write"]);
    const res = await post(cardAction, c.id, { action: "confirm" });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/donor records/);
  });

  test("edit and discard", async () => {
    const c = card();
    w = world([c]);
    const e = await post(cardAction, c.id, { action: "edit", patch: { title: "Book the venue" } });
    expect(e.status).toBe(200);
    expect((await e.json()).card.payload.title).toBe("Book the venue");
    const d = await post(cardAction, c.id, { action: "discard" });
    expect(d.status).toBe(200);
    expect(w.cardRow(c.id).status).toBe("discarded");
    expect((await post(cardAction, c.id, { action: "confirm" })).status).toBe(409);
  });
});

describe("POST /api/admin/capture/[id]/confirm-all", () => {
  test("files proposed cards, skips held, reports per card", async () => {
    const a = card({ position: 0 });
    const b = interactionCard({ position: 1, status: "held", entity_type: null, entity_id: null });
    w = world([a, b]);
    const res = await post(confirmAllRoute as typeof cardAction, CAPTURE_ID);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toEqual([{ id: a.id, ok: true, applied: { table: "ops_tasks", id: w.db.tables.ops_tasks[0].id } }]);
    expect(body.held_skipped).toBe(1);
    expect(body.capture_status).toBe("ready");
    expect(body.ok).toBeUndefined();
  });

  test("402 / 404", async () => {
    w = world([]);
    expect((await post(confirmAllRoute as typeof cardAction, "00000000-0000-0000-0000-0000000000aa")).status).toBe(404);
    entitled = { ok: false, status: 402, error: "upgrade" };
    expect((await post(confirmAllRoute as typeof cardAction, CAPTURE_ID)).status).toBe(402);
  });
});

describe("GET /api/admin/capture/candidates", () => {
  const rows = [
    { id: MARISOL, kind: "constituent", name: "Marisol Quintero", org_name: null, meta: "person", sim: 0.9 },
    { id: PROSPECT, kind: "prospect", name: "Marisol Prospect", org_name: null, meta: null, sim: 0.85 },
    { id: HARBOR, kind: "partner", name: "Harbor Light Academy", org_name: null, meta: "school", sim: 0.5 },
    ...Array.from({ length: 12 }, (_, i) => ({ id: `id-${i}`, kind: "constituent", name: `Mari ${i}`, org_name: null, meta: null, sim: 0.3 })),
  ];
  const get = (qs: string) => candidatesRoute(new NextRequest(`http://localhost/api/admin/capture/candidates${qs}`));

  test("wraps the RPC with the active org, never returns prospects, caps at 8", async () => {
    const calls: unknown[] = [];
    w = world([], { db: { rpc: (name, args) => (calls.push({ name, args }), { data: rows, error: null }) } });
    const res = await get("?q=Mari");
    const body = await res.json();
    expect(calls).toEqual([{ name: "capture_match_candidates", args: { q: "Mari", org: ORG, lim: 16 } }]);
    expect(body.candidates).toHaveLength(8);
    expect(body.candidates.some((c: { kind: string }) => c.kind === "prospect")).toBe(false);
    expect(body.candidates[0]).toEqual({ kind: "constituent", id: MARISOL, name: "Marisol Quintero", org_name: null, meta: "person" });
  });

  test("kind filter; short q returns nothing without a query; bad kind / long q is 400", async () => {
    let called = 0;
    w = world([], { db: { rpc: () => (called++, { data: rows, error: null }) } });
    const partners = await (await get("?q=Harbor&kind=partner")).json();
    expect(partners.candidates.map((c: { id: string }) => c.id)).toEqual([HARBOR]);
    expect((await (await get("?q=M")).json()).candidates).toEqual([]);
    expect(called).toBe(1);
    expect((await get("?q=Mari&kind=prospect")).status).toBe(400);
    expect((await get("?q=Mari&kind=student")).status).toBe(400);
    expect((await get(`?q=${"a".repeat(121)}`)).status).toBe(400);
  });

  test("402 without ai.capture", async () => {
    w = world([]);
    entitled = { ok: false, status: 402, error: "upgrade" };
    expect((await get("?q=Mari")).status).toBe(402);
  });
});
