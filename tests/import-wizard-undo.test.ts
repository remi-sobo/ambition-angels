import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeDb, type FakeDb } from "./support/fakeDb";
import { buildDonorIndex, buildRow, matchDonor, donorNameKey, suggestMapping, verdictFor } from "@/lib/admin/imports/engine";
import { undoSentence } from "@/lib/admin/imports/undo";

// V4 Stage F: the one import wizard. Donor + gift rows (the retired
// /admin/fundraising/import wizard), the duplicate check against existing
// donors by email and name, and Undo by batch id. The caller belongs to org A
// and org B; the fake's `visible` plays RLS, and every route here runs on the
// service role, so only the code's own org pins keep B safe.

const ORG_A = "00000000-0000-0000-0000-00000000000a";
const ORG_B = "00000000-0000-0000-0000-00000000000b";
const ctxFor = (orgId: string) => ({ userId: "u1", email: "ops@example.org", orgId, orgName: "Org", role: "owner" as const });
let db: FakeDb;
let ctx = ctxFor(ORG_A);
let perms = new Set<string>(["fundraising.write", "fundraising.read", "program.write", "program.read"]);

vi.mock("react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react")>();
  return { ...mod, cache: (mod as { cache?: unknown }).cache ?? (<T,>(fn: T) => fn) };
});
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => db.client }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => db.client }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));
vi.mock("@/lib/admin/customFields", async (orig) => ({
  ...(await orig<typeof import("@/lib/admin/customFields")>()),
  getFieldDefs: vi.fn(async () => []),
}));
vi.mock("@/lib/admin/program/stages", () => ({ getParticipantStages: vi.fn(async () => [{ stage_key: "new" }]) }));
vi.mock("@/lib/admin/auth", () => ({
  getOrgContext: vi.fn(async () => ctx),
  ctxHasPermission: vi.fn(async (_c: unknown, p: string) => perms.has(p)),
}));
vi.mock("@/lib/supabase/fetchAll", () => ({
  fetchAll: async (query: () => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>) => {
    const { data, error } = await query();
    return error ? { data: null, error, truncated: false } : { data: data ?? [], error: null, truncated: false };
  },
}));

import { POST as createImport } from "@/app/api/admin/imports/route";
import { POST as stageImport } from "@/app/api/admin/imports/[id]/stage/route";
import { POST as commitImport } from "@/app/api/admin/imports/[id]/commit/route";
import { POST as undoImport } from "@/app/api/admin/imports/[id]/undo/route";

const both = (r: Record<string, unknown>) => r.org_id === ORG_A || r.org_id === ORG_B;

beforeEach(() => {
  ctx = ctxFor(ORG_A);
  perms = new Set(["fundraising.write", "fundraising.read", "program.write", "program.read"]);
  db = fakeDb(
    {
      constituents: [
        { id: "a-shared", org_id: ORG_A, type: "person", first_name: "Ada", last_name: "Archer", emails: ["shared@example.org"], import_id: null },
        { id: "a-noemail", org_id: ORG_A, type: "person", first_name: "Jon", last_name: "Castellano", emails: [], import_id: null },
        { id: "b-shared", org_id: ORG_B, type: "person", first_name: "Bea", last_name: "B", emails: ["shared@example.org"], import_id: null },
        { id: "b-only", org_id: ORG_B, type: "person", first_name: "Bo", last_name: "B", emails: ["only-b@example.org"], import_id: null },
      ],
      gifts: [
        { id: "ga", org_id: ORG_A, constituent_id: "a-shared", amount: 25, gift_date: "2025-02-01", import_id: null },
        { id: "gb", org_id: ORG_B, constituent_id: "b-shared", amount: 500, gift_date: "2025-01-01", import_id: null },
      ],
    },
    { visible: { constituents: both, gifts: both, imports: both, import_rows: both, external_refs: both } },
  );
});

const post = (url: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method: "POST", body: body ? JSON.stringify(body) : undefined, headers: { "content-type": "application/json" } });

async function runImport(entity: "gift" | "constituent" | "student", csv: string) {
  const res = await createImport(post("/api/admin/imports", { entity_type: entity, filename: "file.csv", csv_text: csv }));
  const body = await res.json();
  if (res.status !== 200) return { status: res.status, body, id: null as string | null };
  const id = body.id as string;
  const staged = await (await stageImport(post(`/api/admin/imports/${id}/stage`), { params: { id } })).json();
  const committed = await (await commitImport(post(`/api/admin/imports/${id}/commit`), { params: { id } })).json();
  return { status: 200, body, id, staged, committed };
}

const GIFT_CSV = [
  "First name,Last name,Email,Amount,Date,Method",
  "Ada,Archer,shared@example.org,$40.00,3/1/2025,check", // existing A donor (shared email exists in B too)
  "Bo,B,only-b@example.org,900,2025-01-01,card", // exists only in B: a NEW A donor
  "Bo,B,only-b@example.org,100,2025-02-01,card", // same new donor again: still one donor
  "Ada,Archer,shared@example.org,25,2025-02-01,", // A already has this gift
  "Jon,Castellano,,60,2025-04-01,cash", // no email, matches A by name
  "Nobody,,,0,2025-04-01,", // invalid amount
].join("\n");

describe("donors and gifts through the one wizard", () => {
  test("suggests the gift columns from common headers", () => {
    expect(suggestMapping(["First name", "Email", "Amount", "Date", "Payment method"], "gift", [])).toEqual({
      "First name": "first_name", Email: "email", Amount: "amount", Date: "gift_date", "Payment method": "method",
    });
  });

  test("two-org user: matches and creates only in the active org, never touches B", async () => {
    const before = JSON.parse(JSON.stringify(db.tables));
    const r = await runImport("gift", GIFT_CSV);
    expect(r.status).toBe(200);
    expect(r.staged.counts).toMatchObject({ total: 6, valid: 4, skipped: 1, invalid: 1, new_donors: 1, matched_donors: 2 });
    expect(r.committed).toMatchObject({ done: true, created: 4 });

    for (const { row } of db.inserts) expect(row.org_id).toBe(ORG_A);
    const newGifts = db.tables.gifts.filter((g) => g.import_id === r.id);
    expect(newGifts).toHaveLength(4);
    const orgOf = new Map(db.tables.constituents.map((c) => [c.id, c.org_id]));
    for (const g of newGifts) expect(orgOf.get(g.constituent_id as string)).toBe(ORG_A);
    expect(newGifts.find((g) => g.amount === 40)!.constituent_id).toBe("a-shared");
    expect(newGifts.find((g) => g.amount === 60)!.constituent_id).toBe("a-noemail");
    const created = db.tables.constituents.filter((c) => c.import_id === r.id);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ org_id: ORG_A, first_name: "Bo", emails: ["only-b@example.org"] });
    expect(newGifts.filter((g) => g.constituent_id === created[0].id)).toHaveLength(2);

    const orgB = (t: Record<string, unknown>[]) => t.filter((x) => x.org_id === ORG_B);
    expect(orgB(db.tables.constituents)).toEqual(orgB(before.constituents));
    expect(orgB(db.tables.gifts)).toEqual(orgB(before.gifts));

    const run = db.tables.imports.find((x) => x.id === r.id)!;
    expect(run.status).toBe("done");
    expect((run.counts as Record<string, unknown>).donors_created).toBe(1);
  });

  test("the gift duplicate check reads only the active org", async () => {
    ctx = ctxFor(ORG_B);
    const r = await runImport("gift", ["Email,Amount,Date", "shared@example.org,500,2025-01-01", "shared@example.org,25,2025-02-01"].join("\n"));
    expect(r.staged.counts).toMatchObject({ valid: 1, skipped: 1 });
    const g = db.tables.gifts.find((x) => x.import_id === r.id)!;
    expect(g).toMatchObject({ org_id: ORG_B, constituent_id: "b-shared", amount: 25 });
  });
});

describe("duplicate check for donors: email, then name", () => {
  test("a name match counts only when one side has no email", () => {
    const idx = buildDonorIndex([
      { id: "x", type: "person", first_name: "Dana", last_name: "Whitfield", emails: ["dana@example.org"] },
      { id: "y", type: "organization", org_name: "Harlow Family Fund", emails: [] },
    ]);
    expect(matchDonor({ first_name: "dana", last_name: "WHITFIELD" }, idx)).toEqual({ id: "x", by: "name" });
    expect(matchDonor({ first_name: "Dana", last_name: "Whitfield", email: "other@example.org" }, idx)).toBeNull();
    expect(matchDonor({ email: "dana@example.org" }, idx)).toEqual({ id: "x", by: "email" });
    expect(matchDonor({ org_name: "Harlow  Family Fund", email: "grants@example.org" }, idx)).toEqual({ id: "y", by: "name" });
    expect(donorNameKey({ first_name: "Dana" })).toBeNull();
    expect(verdictFor(false, null, "x")).toEqual({ verdict: "skip", reason: "matches_name", matchedEntityId: "x" });
  });

  test("donor import skips name matches in the active org only", async () => {
    const r = await runImport("constituent", ["First name,Last name,Email", "Jon,Castellano,", "Bo,B,", "Ada,Archer,new@example.org"].join("\n"));
    expect(r.staged.counts).toMatchObject({ valid: 2, skipped: 1 });
    const created = db.tables.constituents.filter((c) => c.import_id === r.id);
    expect(created.map((c) => c.first_name).sort()).toEqual(["Ada", "Bo"]);
  });

  test("gift rows need a donor, an amount and a date", () => {
    const ctx0 = { entity: "gift" as const, defs: [], stageKeys: new Set<string>() };
    expect(buildRow({ amount: "10", gift_date: "2025-01-01" }, ctx0)).toMatchObject({ ok: false });
    expect(buildRow({ email: "a@example.org", amount: "abc", gift_date: "2025-01-01" }, ctx0)).toMatchObject({ ok: false });
    expect(buildRow({ email: "a@example.org", amount: "$1,250.50", gift_date: "6/1/2025", method: "Credit Card" }, ctx0)).toMatchObject({
      ok: true, spine: { amount: 1250.5, gift_date: "2025-06-01", method: "card" },
    });
  });
});

describe("undo: only that batch, only this org", () => {
  test("removes what the batch made; keeps thanked gifts and donors with newer activity", async () => {
    const r = await runImport("gift", GIFT_CSV);
    const id = r.id!;
    const newDonor = db.tables.constituents.find((c) => c.import_id === id)!;
    // Since the import: one gift was thanked, and an unrelated batch and
    // another org carry rows with import ids of their own.
    const thanked = db.tables.gifts.find((g) => g.import_id === id && g.amount === 40)!;
    thanked.acknowledgment_status = "sent";
    db.tables.gifts.push({ id: "other-batch", org_id: ORG_A, constituent_id: "a-shared", amount: 5, gift_date: "2025-05-01", import_id: "11111111-1111-1111-1111-111111111111" });
    db.tables.gifts.push({ id: "b-same-batch-id", org_id: ORG_B, constituent_id: "b-only", amount: 7, gift_date: "2025-05-01", import_id: id });
    db.tables.interactions = [{ id: "talk", org_id: ORG_A, constituent_id: newDonor.id }];

    const res = await undoImport(post(`/api/admin/imports/${id}/undo`), { params: { id } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.removed).toEqual({ gifts: 3, donors: 0, participants: 0 });
    expect(body.kept).toEqual({ gifts: 1, donors: 1, participants: 0 });
    expect(body.message).toBe("Removed 3 gifts. Kept 1 thanked gift and 1 donor with newer activity.");

    const ids = db.tables.gifts.map((g) => g.id);
    expect(ids).toEqual(expect.arrayContaining(["ga", "gb", "other-batch", "b-same-batch-id", thanked.id]));
    expect(db.tables.gifts.filter((g) => g.import_id === id && g.org_id === ORG_A)).toHaveLength(1);
    expect(db.tables.constituents.find((c) => c.id === newDonor.id)).toBeTruthy();
    expect(db.tables.imports.find((x) => x.id === id)).toMatchObject({ status: "undone", undone_by: "u1" });

    const again = await undoImport(post(`/api/admin/imports/${id}/undo`), { params: { id } });
    expect(again.status).toBe(409);
  });

  test("a clean batch is removed entirely, provenance too, so the file can come in again", async () => {
    const r = await runImport("gift", ["Email,First name,Last name,Amount,Date", "new@example.org,Priya,Raman,75,2025-03-03"].join("\n"));
    const id = r.id!;
    expect(db.tables.external_refs.filter((x) => x.org_id === ORG_A)).toHaveLength(1);
    const res = await undoImport(post(`/api/admin/imports/${id}/undo`), { params: { id } });
    expect((await res.json()).removed).toEqual({ gifts: 1, donors: 1, participants: 0 });
    expect(db.tables.constituents.filter((c) => c.import_id === id)).toHaveLength(0);
    expect(db.tables.external_refs.filter((x) => x.org_id === ORG_A)).toHaveLength(0);
  });

  test("another org's import id is not found from this org", async () => {
    const r = await runImport("gift", ["Email,Amount,Date", "x@example.org,10,2025-01-01"].join("\n"));
    ctx = ctxFor(ORG_B);
    const res = await undoImport(post(`/api/admin/imports/${r.id}/undo`), { params: { id: r.id! } });
    expect(res.status).toBe(404);
    expect(db.tables.gifts.filter((g) => g.import_id === r.id)).toHaveLength(1);
  });

  test("participants: removed with their enrollments, unless attendance was taken", async () => {
    const r = await runImport("student", ["First name,Email", "Maya,maya@example.org", "Theo,theo@example.org"].join("\n"));
    const id = r.id!;
    const [maya, theo] = db.tables.students.filter((s) => s.import_id === id);
    db.tables.cohort_members = [{ id: "m1", org_id: ORG_A, cohort_id: "c1", student_id: maya.id }];
    db.tables.attendance = [{ id: "at", org_id: ORG_A, student_id: theo.id }];
    const body = await (await undoImport(post(`/api/admin/imports/${id}/undo`), { params: { id } })).json();
    expect(body.removed.participants).toBe(1);
    expect(body.kept.participants).toBe(1);
    expect(db.tables.students.map((s) => s.id)).toEqual([theo.id]);
    expect(db.tables.cohort_members).toHaveLength(0);
  });

  test("the run's own module is required to import or undo", async () => {
    perms = new Set(["fundraising.write"]);
    const res = await createImport(post("/api/admin/imports", { entity_type: "student", csv_text: "First name\nMaya" }));
    expect(res.status).toBe(403);
    perms = new Set(["program.write", "fundraising.write"]);
    const r = await runImport("student", "First name\nMaya");
    perms = new Set(["fundraising.write"]);
    const undo = await undoImport(post(`/api/admin/imports/${r.id}/undo`), { params: { id: r.id! } });
    expect(undo.status).toBe(403);
    expect(db.tables.students).toHaveLength(1);
  });

  test("the sentence names what was kept", () => {
    expect(undoSentence({ removed: { gifts: 0, donors: 0, participants: 0 }, kept: { gifts: 0, donors: 0, participants: 0 } })).toBe("Nothing was left to remove.");
  });
});
