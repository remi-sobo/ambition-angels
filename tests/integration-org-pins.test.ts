import { beforeEach, describe, expect, test, vi } from "vitest";
import { fakeDb, type FakeDb } from "./support/fakeDb";

// Pre-SafeSpace org pins. Env-credential integrations (HubSpot token, the
// Gmail sync mailbox) act for exactly ONE org, resolved from data
// (lib/integrations/env-owner.ts); every other org is refused and nothing
// leaves the building. Gift/pledge entry by donor name never crosses orgs and
// survives any characters in the name.

const AA = "org-aa";
const SS = "org-safespace";
const ctxFor = (orgId: string) => ({ userId: "u1", email: "u@example.org", orgId, orgName: orgId, role: "owner" as const });

let admin: FakeDb = fakeDb();
let session: FakeDb = fakeDb();
let ctx: ReturnType<typeof ctxFor> | null = null;

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => admin.client }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => session.client }));
vi.mock("@/lib/admin/auth", () => ({
  getOrgContext: vi.fn(async () => ctx),
  getAdminUser: vi.fn(async () => "tester"),
  isAuthed: vi.fn(async () => !!ctx),
  // Role guard covered in tests/require-permission.test.ts; these callers hold it.
  ctxHasPermission: vi.fn(async () => true),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));
vi.mock("@/lib/fundraising/stewardship", () => ({ processGiftStewardship: vi.fn(async () => {}) }));
vi.mock("@/lib/google/gmail-read", () => ({
  listMessageIds: vi.fn(async () => ({ ids: ["m1"], nextPageToken: null })),
  getMessage: vi.fn(async () => ({
    messageId: "gm-1",
    threadId: "t-1",
    internalDate: 1_700_000_000_000,
    direction: "inbound",
    subject: "Hello",
    snippet: "hi",
  })),
  counterpartyEmails: vi.fn(() => ["donor@example.org"]),
  staffCoPresent: vi.fn(() => false),
}));

import { resolveEnvIntegrationOwner } from "@/lib/integrations/env-owner";
import { pushConstituentToHubSpot, pushGiftToHubSpot } from "@/lib/hubspot/sync-out";
import { POST as integrationsPOST } from "@/app/api/admin/integrations/hubspot/route";
import { GET as hubspotSearchGET } from "@/app/api/admin/fundraising/prospects/hubspot-search/route";
import { GET as hubspotCronGET } from "@/app/api/cron/hubspot-sync/route";
import { GET as gmailCronGET } from "@/app/api/cron/gmail-sync/route";
import { POST as gmailAdminPOST } from "@/app/api/admin/fundraising/gmail-sync/route";
import { POST as giftsPOST } from "@/app/api/admin/gifts/route";
import { POST as pledgesPOST } from "@/app/api/admin/pledges/route";
import { listMessageIds } from "@/lib/google/gmail-read";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const req = (url: string, init?: RequestInit) => new Request(`http://localhost${url}`, init) as any;
const postJson = (url: string, body: unknown) =>
  req(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const cron = (url: string) => req(url, { headers: { authorization: "Bearer cron-secret" } });

const ownerEnt = (orgId: string) => ({ org_id: orgId, feature_key: "aa.hubspot_mirror", enabled: true });
const conn = (orgId: string) => ({
  org_id: orgId,
  provider: "hubspot",
  status: "active",
  meta: { sync_out: true, sync_in: true, sync_gifts_as_deals: true },
});

const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ id: "hs-new" }), { status: 200 }));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.HUBSPOT_ACCESS_TOKEN = "test-token";
  process.env.CRON_SECRET = "cron-secret";
  vi.stubGlobal("fetch", fetchSpy);
  ctx = null;
  session = fakeDb();
  admin = fakeDb({
    org_entitlements: [ownerEnt(AA)],
    connections: [conn(AA)],
    constituents: [
      { id: "c-aa", org_id: AA, type: "person", first_name: "Ann", last_name: "Lee", emails: ["donor@example.org"], external_ids: {} },
      { id: "c-ss", org_id: SS, type: "person", first_name: "Sam", last_name: "Roe", emails: ["donor@example.org"], external_ids: {} },
    ],
    gifts: [{ id: "g-ss", org_id: SS, constituent_id: "c-ss", amount: 50, gift_date: "2026-11-01" }],
  });
});

describe("env integration owner", () => {
  test("one org holding the entitlement is the owner", async () => {
    expect(await resolveEnvIntegrationOwner("hubspot")).toEqual({ ok: true, orgId: AA });
  });

  test("no holder, or two holders, resolves to nothing", async () => {
    admin.tables.org_entitlements = [];
    expect((await resolveEnvIntegrationOwner("hubspot")).ok).toBe(false);
    admin.tables.org_entitlements = [ownerEnt(AA), ownerEnt(SS)];
    const r = await resolveEnvIntegrationOwner("gmail_sync");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/more than one org/);
  });
});

describe("HubSpot is pinned to the owner org", () => {
  test("another org's donor and gift are never pushed, even with its own active connection", async () => {
    admin.tables.connections.push(conn(SS));
    await pushConstituentToHubSpot("c-ss");
    await pushGiftToHubSpot("g-ss");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("a non-owner connection row never turns sync on", async () => {
    admin.tables.connections = [conn(SS)];
    await pushConstituentToHubSpot("c-ss");
    await pushConstituentToHubSpot("c-aa");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("the owner's own donor still pushes (control)", async () => {
    await pushConstituentToHubSpot("c-aa");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test("a non-owner org cannot connect HubSpot (403, no connection row)", async () => {
    ctx = ctxFor(SS);
    const res = await integrationsPOST(postJson("/api/admin/integrations/hubspot", { action: "connect" }));
    expect(res.status).toBe(403);
    expect(admin.tables.connections.filter((c) => c.org_id === SS)).toEqual([]);

    ctx = ctxFor(AA);
    const ok = await integrationsPOST(postJson("/api/admin/integrations/hubspot", { action: "set_flags", sync_in: false }));
    expect(ok.status).toBe(200);
  });

  test("a non-owner org cannot search the HubSpot mirror", async () => {
    ctx = ctxFor(SS);
    const rpc = vi.spyOn(admin.client, "rpc");
    const res = await hubspotSearchGET(req("/api/admin/fundraising/prospects/hubspot-search?q=a"));
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  test("the sync cron skips when the owner is ambiguous, and writes nothing", async () => {
    admin.tables.org_entitlements = [ownerEnt(AA), ownerEnt(SS)];
    const res = await hubspotCronGET(cron("/api/cron/hubspot-sync"));
    const body = await res.json();
    expect(body.status).toBe("skipped");
    expect(body.reason).toMatch(/more than one org/);
    expect(admin.tables.hs_sync_jobs ?? []).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("Gmail sync is pinned to the owner org", () => {
  test("the cron writes interactions only under the resolved org", async () => {
    const res = await gmailCronGET(cron("/api/cron/gmail-sync"));
    expect((await res.json()).status).toBe("completed");
    expect(admin.tables.gmail_sync_jobs.map((j) => j.org_id)).toEqual([AA]);
    const interactions = admin.tables.interactions ?? [];
    expect(interactions.length).toBe(1);
    expect(interactions[0]).toMatchObject({ org_id: AA, constituent_id: "c-aa" });
  });

  test("ambiguous or missing owner: the cron does nothing and says why", async () => {
    for (const ents of [[ownerEnt(AA), ownerEnt(SS)], []]) {
      admin.tables.org_entitlements = ents;
      const body = await (await gmailCronGET(cron("/api/cron/gmail-sync"))).json();
      expect(body.status).toBe("skipped");
      expect(typeof body.reason).toBe("string");
    }
    expect(admin.tables.gmail_sync_jobs ?? []).toEqual([]);
    expect(admin.tables.interactions ?? []).toEqual([]);
    expect(listMessageIds).not.toHaveBeenCalled();
  });

  test("a non-owner org cannot start a sync from the admin button", async () => {
    ctx = ctxFor(SS);
    const res = await gmailAdminPOST(postJson("/api/admin/fundraising/gmail-sync", {}));
    expect(res.status).toBe(403);
    expect(admin.tables.gmail_sync_jobs ?? []).toEqual([]);
  });
});

describe("gift entry by donor name", () => {
  const gift = (extra: Record<string, unknown>) =>
    giftsPOST(postJson("/api/admin/gifts", { amount: 100, gift_date: "2026-11-20", ...extra }));

  beforeEach(() => {
    // The session client sees every org the user belongs to (RLS is
    // permission-scoped), so both orgs' donors are visible to it.
    session = fakeDb({
      constituents: [
        { id: "aa-jane", org_id: AA, type: "person", first_name: "Jane", last_name: "Doe" },
        { id: "ss-trust", org_id: SS, type: "organization", org_name: "Smith, Jane (Trust)" },
        { id: "ss-x1", org_id: SS, type: "person", first_name: "Pat", last_name: "Kim" },
        { id: "ss-x2", org_id: SS, type: "person", first_name: "Pat", last_name: "Kim" },
      ],
    });
    ctx = ctxFor(SS);
  });

  test("never links another org's donor", async () => {
    const res = await gift({ constituent_name: "Jane Doe" });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.constituent_id).not.toBe("aa-jane");
    const created = session.tables.constituents.find((c) => c.id === body.constituent_id);
    expect(created).toMatchObject({ org_id: SS, first_name: "Jane", last_name: "Doe" });
    expect(session.tables.gifts[0]).toMatchObject({ org_id: SS, constituent_id: body.constituent_id });
  });

  test("an explicit id from another org is refused", async () => {
    const res = await gift({ constituent_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" });
    expect(res.status).toBe(404);
    expect(session.tables.gifts ?? []).toEqual([]);
  });

  test("a name with a comma and parentheses matches the existing donor, no duplicate", async () => {
    const before = session.tables.constituents.length;
    const res = await gift({ constituent_name: "Smith, Jane (Trust)" });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.constituent_id).toBe("ss-trust");
    expect(session.tables.constituents.length).toBe(before);
  });

  test("wildcard characters never widen the match", async () => {
    const res = await gift({ constituent_name: "Smith_ Jane _Trust_" });
    const body = await res.json();
    expect(body.constituent_id).not.toBe("ss-trust");
  });

  test("several matches are not guessed: 409 with candidates, no gift", async () => {
    const res = await gift({ constituent_name: "pat kim" });
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.candidates.map((c: { id: string }) => c.id).sort()).toEqual(["ss-x1", "ss-x2"]);
    expect(session.tables.gifts ?? []).toEqual([]);
  });

  test("pledges follow the same rules", async () => {
    const res = await pledgesPOST(
      postJson("/api/admin/pledges", {
        constituent_name: "Smith, Jane (Trust)",
        total_amount: 1200,
        installment_count: 12,
        start_date: "2026-12-01",
      })
    );
    expect(res.status).toBe(200);
    expect(session.tables.pledges[0]).toMatchObject({ org_id: SS, constituent_id: "ss-trust" });
  });
});
