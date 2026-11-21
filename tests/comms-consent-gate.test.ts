import { beforeEach, describe, expect, test, vi } from "vitest";
import { fakeDb, type Row } from "./support/commsFakeDb";

/**
 * V4 Stage D: "a story about an identifiable participant cannot be used in
 * any output until a consent record is on file", enforced on the SERVER in
 * every output path: the gate itself, filling an edition slot, compiling an
 * edition into an email draft, queueing (and previewing) that email, a test
 * send, and the worker at the moment of sending each copy.
 */

const ORG = "00000000-0000-0000-0000-00000000000a";
const OTHER = "00000000-0000-0000-0000-00000000000b";
const S_OK = "10000000-0000-0000-0000-000000000001"; // approved, consented participant
const S_NO = "10000000-0000-0000-0000-000000000002"; // approved, participant, no consent
const S_REV = "10000000-0000-0000-0000-000000000003"; // approved, consent revoked
const S_PEND = "10000000-0000-0000-0000-000000000004"; // approved, consent only requested
const S_NONE = "10000000-0000-0000-0000-000000000005"; // approved, no one identifiable
const S_RAW = "10000000-0000-0000-0000-000000000006"; // consented but not approved
const S_X = "10000000-0000-0000-0000-000000000007"; // another org's approved story
const ED = "20000000-0000-0000-0000-000000000001";
const CAMP = "30000000-0000-0000-0000-000000000001";

function seed(): Record<string, Row[]> {
  return {
    stories: [
      { id: S_OK, org_id: ORG, title: "Robotics club", status: "approved" },
      { id: S_NO, org_id: ORG, title: "A question about pay", status: "approved" },
      { id: S_REV, org_id: ORG, title: "Summer job", status: "approved" },
      { id: S_PEND, org_id: ORG, title: "First budget", status: "approved" },
      { id: S_NONE, org_id: ORG, title: "Showcase night", status: "approved" },
      { id: S_RAW, org_id: ORG, title: "Draft", status: "raw" },
      { id: S_X, org_id: OTHER, title: "Elsewhere", status: "approved" },
    ],
    story_subjects: [
      { id: "sub-ok", org_id: ORG, story_id: S_OK, subject_type: "participant", display_label: "Jaylen M." },
      { id: "sub-no", org_id: ORG, story_id: S_NO, subject_type: "participant", display_label: "Sofia P." },
      { id: "sub-rev", org_id: ORG, story_id: S_REV, subject_type: "participant", display_label: "Ana R." },
      { id: "sub-pend", org_id: ORG, story_id: S_PEND, subject_type: "participant", display_label: "Leo T." },
      { id: "sub-none", org_id: ORG, story_id: S_NONE, subject_type: "none", display_label: "No one identifiable" },
      { id: "sub-raw", org_id: ORG, story_id: S_RAW, subject_type: "participant", display_label: "Kim L." },
    ],
    story_consents: [
      { id: "c1", org_id: ORG, story_subject_id: "sub-ok", scope: ["first_name"], granted_at: "2026-09-01", granted_by: "Parent", requested_at: null, expires_at: null, revoked_at: null },
      { id: "c2", org_id: ORG, story_subject_id: "sub-rev", scope: ["first_name"], granted_at: "2026-09-01", granted_by: "Parent", requested_at: null, expires_at: null, revoked_at: "2026-11-01T00:00:00Z" },
      { id: "c3", org_id: ORG, story_subject_id: "sub-pend", scope: ["first_name"], granted_at: null, requested_at: "2026-11-10", expires_at: null, revoked_at: null },
      { id: "c4", org_id: ORG, story_subject_id: "sub-raw", scope: ["first_name"], granted_at: "2026-09-01", granted_by: "Parent", requested_at: null, expires_at: null, revoked_at: null },
    ],
    comms_editions: [{ id: ED, org_id: ORG, format_id: "f1", title: "Winter update", subject: null, status: "drafting", target_date: null, email_campaign_id: CAMP, sent_at: null, created_at: "2026-11-01" }],
    comms_edition_slots: [
      { id: "sl1", org_id: ORG, edition_id: ED, slot_key: "work", slot_def: { key: "work", label: "The work", kind: "story", required: true }, story_id: S_NO, metric_ids: null, content: null, position: 0 },
    ],
    email_campaigns: [{ id: CAMP, org_id: ORG, name: "Winter update", subject: "Winter", body: "text", status: "draft", segment_id: "seg-1" }],
    segments: [{ id: "seg-1", org_id: ORG, name: "Everyone", definition: {} }],
  };
}

// ── The gate ────────────────────────────────────────────────────────────────

describe("storyVerdicts: the one rule every output path asks", async () => {
  const { storyVerdicts, campaignStoryBlock } = await import("@/lib/comms/story-gate");

  test("only an approved story whose identifiable people all have a live grant is usable", async () => {
    const db = fakeDb(seed());
    const v = await storyVerdicts(db.client, ORG, [S_OK, S_NO, S_REV, S_PEND, S_NONE, S_RAW]);
    expect(v.get(S_OK)?.publishable).toBe(true);
    expect(v.get(S_NONE)?.publishable).toBe(true);
    expect(v.get(S_NO)?.publishable).toBe(false);
    expect(v.get(S_NO)?.reason).toMatch(/No consent on record/);
    expect(v.get(S_REV)?.reason).toMatch(/revoked/);
    expect(v.get(S_PEND)?.reason).toMatch(/requested but not granted/);
    expect(v.get(S_RAW)?.reason).toMatch(/Not approved/);
  });

  test("another org's story is not found, so it is blocked (the org pin is the fence)", async () => {
    const db = fakeDb(seed());
    const v = await storyVerdicts(db.client, ORG, [S_X]);
    expect(v.get(S_X)?.publishable).toBe(false);
    expect(v.get(S_X)?.reason).toMatch(/no longer in the story bank/);
  });

  test("fails closed: a read error blocks every story, even a consented one", async () => {
    const db = fakeDb(seed(), { failRead: ["story_subjects"] });
    const v = await storyVerdicts(db.client, ORG, [S_OK, S_NONE]);
    expect(Array.from(v.values()).every((x) => !x.publishable)).toBe(true);
  });

  test("a campaign compiled from an edition is blocked by any held story in it; a hand-written one is not", async () => {
    const db = fakeDb(seed());
    expect(await campaignStoryBlock(db.client, ORG, CAMP)).toMatch(/can't go out.*A question about pay/);
    expect(await campaignStoryBlock(db.client, ORG, "30000000-0000-0000-0000-0000000000ff")).toBeNull();
    const ok = seed();
    ok.comms_edition_slots[0].story_id = S_OK;
    expect(await campaignStoryBlock(fakeDb(ok).client, ORG, CAMP)).toBeNull();
    expect(await campaignStoryBlock(fakeDb(seed(), { failRead: ["comms_edition_slots"] }).client, ORG, CAMP)).toMatch(/couldn't check consent/);
  });
});

// ── The routes and the send path ────────────────────────────────────────────

let db = fakeDb(seed());
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => db.client }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => db.client }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));
vi.mock("@/lib/admin/requirePermission", () => ({
  requirePermission: vi.fn(async () => ({ ok: true, ctx: { orgId: ORG, userId: "u1", role: "owner" } })),
}));
vi.mock("@/lib/admin/auth", () => ({
  getOrgContext: vi.fn(async () => ({ orgId: ORG, userId: "u1", role: "owner" })),
  ctxHasPermission: vi.fn(async () => true),
  getAdminUser: vi.fn(async () => "remi"),
}));
vi.mock("@/lib/admin/metrics/catalog", () => ({ getMetricCatalog: vi.fn(async () => []) }));
vi.mock("server-only", () => ({}));

const req = (body: unknown) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) as any;

beforeEach(() => {
  db = fakeDb(seed());
});

describe("edition slot: the server refuses a held story", () => {
  test("403 with the reason, and nothing written", async () => {
    const { PATCH } = await import("@/app/api/admin/comms/editions/[id]/slots/route");
    const res = await PATCH(req({ slot_key: "work", story_id: S_REV }), { params: { id: ED } });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/revoked/);
    expect(db.writes.filter((w) => w.table === "comms_edition_slots")).toEqual([]);
  });

  test("a consented, approved story is placed", async () => {
    const { PATCH } = await import("@/app/api/admin/comms/editions/[id]/slots/route");
    const res = await PATCH(req({ slot_key: "work", story_id: S_OK }), { params: { id: ED } });
    expect(res.status).toBe(200);
    expect(db.tables.comms_edition_slots[0].story_id).toBe(S_OK);
  });
});

describe("compile: no email draft is made around a held story", () => {
  test("409 naming the story, and no email_campaigns write", async () => {
    const { POST } = await import("@/app/api/admin/comms/editions/[id]/compile/route");
    const res = await POST(req({}), { params: { id: ED } });
    expect(res.status).toBe(409);
    const j = await res.json();
    expect(j.blocked.join(" ")).toMatch(/A question about pay/);
    expect(db.writes.filter((w) => w.table === "email_campaigns")).toEqual([]);
  });

  test("with the story consented it rewrites the one draft and attaches the audience; it never sends", async () => {
    db.tables.comms_edition_slots[0].story_id = S_OK;
    db.tables.stories[0].body = "Jaylen started a robotics club.";
    const { POST } = await import("@/app/api/admin/comms/editions/[id]/compile/route");
    const res = await POST(req({ segment_id: "40000000-0000-0000-0000-000000000001" }), { params: { id: ED } });
    // That segment is not in this org: refused before anything is written.
    expect(res.status).toBe(404);
    db.tables.segments.push({ id: "40000000-0000-0000-0000-000000000002", org_id: ORG, name: "Lapsed", definition: { view: "lapsed" } });
    const ok = await POST(req({ segment_id: "40000000-0000-0000-0000-000000000002" }), { params: { id: ED } });
    expect(ok.status).toBe(200);
    expect(db.tables.email_campaigns[0].status).toBe("draft");
    expect(db.tables.email_campaigns[0].segment_id).toBe("40000000-0000-0000-0000-000000000002");
    expect(db.tables.email_sends ?? []).toEqual([]);
  });
});

describe("queue, preview and test send re-check consent", () => {
  test("startCampaign refuses before claiming the draft or queueing anyone", async () => {
    const { startCampaign } = await import("@/lib/comms/queue");
    const r = await startCampaign(db.client, ORG, CAMP, null);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(409);
      expect(r.error).toMatch(/A question about pay/);
    }
    expect(db.writes).toEqual([]);
  });

  test("previewCampaign shows the refusal in the send confirm", async () => {
    const { previewCampaign } = await import("@/lib/comms/queue");
    const r = await previewCampaign(db.client, ORG, CAMP);
    expect(r.ok).toBe(false);
  });

  test("a test copy is refused too", async () => {
    const { POST } = await import("@/app/api/admin/comms/[id]/test/route");
    const res = await POST(req({ email: "me@example.org" }), { params: { id: CAMP } });
    expect(res.status).toBe(409);
  });
});

describe("the worker checks again at the moment of sending", () => {
  test("a queued copy of an email whose story lost consent is skipped with the reason, never sent", async () => {
    const send = vi.fn(async () => ({ providerMessageId: "m1" }));
    vi.doMock("@/lib/comms/transport", () => ({
      transportFor: async () => ({ transport: { kind: "resend", send } }),
      TransportError: class extends Error {},
    }));
    vi.doMock("@/lib/comms/safety", () => ({ raiseAlarms: async () => 0, sendLeadershipCopies: async () => 0 }));
    vi.resetModules();
    const s = seed();
    s.email_campaigns[0].status = "sending";
    s.org_comms_settings = [{ org_id: ORG, from_name: "Demo", from_email: "hello@example.org", reply_to: null, mailing_address: "1 Main St", footer_text: null, daily_send_cap: 400, transport: "resend" }];
    s.email_sends = [{ id: "es1", org_id: ORG, campaign_id: CAMP, constituent_id: null, email: "donor@example.org", first_name: "Pat", status: "sending", tracking_token: "t1" }];
    let claimed = false;
    db = fakeDb(s, {
      rpc: {
        comms_queue_tick: () => [ORG],
        claim_email_sends: () => {
          if (claimed) return [];
          claimed = true;
          return [{ id: "es1", org_id: ORG, campaign_id: CAMP, constituent_id: null, email: "donor@example.org", first_name: "Pat", tracking_token: "t1" }];
        },
        finish_email_campaigns: () => 0,
      },
    });
    const { drainQueue } = await import("@/lib/comms/worker");
    await drainQueue();
    expect(send).not.toHaveBeenCalled();
    const row = db.tables.email_sends.find((r) => r.id === "es1")!;
    expect(row.status).toBe("skipped");
    expect(String(row.error)).toMatch(/can't go out/);
  });
});
