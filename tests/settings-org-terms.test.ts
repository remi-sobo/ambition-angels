import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeDb, type FakeDb } from "./support/fakeDb";
import {
  checklistDismissed,
  identityComplete,
  mergeIdentityIntoSettings,
  readOrgIdentity,
  validateIdentityInput,
} from "@/lib/admin/orgIdentity";
import { validateTermsInput } from "@/lib/admin/termsEditor";
import { connectionRows } from "@/lib/admin/connectionsView";
import { buildOrgEmailIdentity } from "@/lib/email/org-identity";

// V4 Stage F: Settings → Organization, Terms and the checklist dismiss.
// Writes are owner/admin only (org.manage) and pinned to the ACTIVE org: the
// caller belongs to org A and org B and the fake's `visible` plays RLS, so an
// unpinned write would touch B too.

const ORG_A = "00000000-0000-0000-0000-00000000000a";
const ORG_B = "00000000-0000-0000-0000-00000000000b";
let db: FakeDb;
let perms = new Set<string>(["org.manage"]);
const ctx = { userId: "u1", email: "maya@harbor.example.org", orgId: ORG_A, orgName: "Harbor", role: "owner" as const };
const finWrites: { orgId: string; fields: Record<string, unknown> }[] = [];

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => db.client }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => db.client }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));
vi.mock("@/lib/admin/auth", () => ({
  getOrgContext: vi.fn(async () => ctx),
  ctxHasPermission: vi.fn(async (_c: unknown, p: string) => perms.has(p)),
}));
vi.mock("@/lib/admin/finance", () => ({
  upsertFinConfig: vi.fn(async (orgId: string, fields: Record<string, unknown>) => {
    finWrites.push({ orgId, fields });
    return { data: {}, error: null };
  }),
}));

import { PATCH as patchOrg } from "@/app/api/admin/settings/organization/route";
import { PUT as putTerms } from "@/app/api/admin/settings/terms/route";
import { POST as postChecklist } from "@/app/api/admin/settings/setup-checklist/route";

const both = (r: Record<string, unknown>) => r.org_id === ORG_A || r.org_id === ORG_B || r.id === ORG_A || r.id === ORG_B;

beforeEach(() => {
  perms = new Set(["org.manage"]);
  finWrites.length = 0;
  db = fakeDb(
    {
      orgs: [
        { id: ORG_A, name: "Harbor", slug: "harbor", settings: { email_domain: "harbor.example.org" } },
        { id: ORG_B, name: "Other", slug: "other", settings: { legal_name: "Other Org", ein: "98-7654321" } },
      ],
      org_terminology: [
        { org_id: ORG_A, term_key: "cohort", label: "Crew" },
        { org_id: ORG_B, term_key: "cohort", label: "Chapter" },
      ],
    },
    { visible: { orgs: both, org_terminology: both }, unique: { org_terminology: [["org_id", "term_key"]] } },
  );
});

const req = (url: string, method: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });

const ORG_BODY = {
  name: "Harbor Youth Collective",
  legal_name: "Harbor Youth Collective, Inc.",
  ein: "123456789",
  address: { street: "88 Wharf Street", city: "Portland", state: "ME", postal_code: "04101" },
  timezone: "America/New_York",
  fiscal_year_start_month: 7,
};

describe("Settings → Organization", () => {
  test("refused without org.manage; nothing changes", async () => {
    perms = new Set(["fundraising.write"]);
    const res = await patchOrg(req("/api/admin/settings/organization", "PATCH", ORG_BODY));
    expect(res.status).toBe(403);
    expect(db.tables.orgs.find((o) => o.id === ORG_A)!.name).toBe("Harbor");
    expect(finWrites).toEqual([]);
  });

  test("saves into the active org only, keeps other settings, writes the fiscal year to fin_config", async () => {
    const res = await patchOrg(req("/api/admin/settings/organization", "PATCH", ORG_BODY));
    expect(res.status).toBe(200);
    const a = db.tables.orgs.find((o) => o.id === ORG_A)!;
    expect(a.name).toBe("Harbor Youth Collective");
    expect(a.settings).toMatchObject({
      email_domain: "harbor.example.org",
      legal_name: "Harbor Youth Collective, Inc.",
      ein: "12-3456789",
      mailing_address: "88 Wharf Street, Portland, ME 04101",
      timezone: "America/New_York",
    });
    const b = db.tables.orgs.find((o) => o.id === ORG_B)!;
    expect(b.name).toBe("Other");
    expect(b.settings).toEqual({ legal_name: "Other Org", ein: "98-7654321" });
    expect(finWrites).toEqual([{ orgId: ORG_A, fields: { fiscal_year_start_month: 7 } }]);
  });

  test("a bad EIN or month is refused on its field", async () => {
    const bad = await patchOrg(req("/api/admin/settings/organization", "PATCH", { ...ORG_BODY, ein: "12-34" }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).field).toBe("ein");
    const month = await patchOrg(req("/api/admin/settings/organization", "PATCH", { ...ORG_BODY, fiscal_year_start_month: 13 }));
    expect(month.status).toBe(400);
  });
});

describe("Settings → Terms", () => {
  test("refused without org.manage", async () => {
    perms = new Set(["staff.read"]);
    const res = await putTerms(req("/api/admin/settings/terms", "PUT", { terms: { student: "Youth" } }));
    expect(res.status).toBe(403);
    expect(db.tables.org_terminology).toHaveLength(2);
  });

  test("sets and resets words in the active org only", async () => {
    const res = await putTerms(req("/api/admin/settings/terms", "PUT", { terms: { student: " Youth ", cohort: "" } }));
    expect(res.status).toBe(200);
    const rows = db.tables.org_terminology;
    expect(rows).toContainEqual(expect.objectContaining({ org_id: ORG_A, term_key: "student", label: "Youth" }));
    expect(rows.find((r) => r.org_id === ORG_A && r.term_key === "cohort")).toBeUndefined();
    expect(rows).toContainEqual(expect.objectContaining({ org_id: ORG_B, term_key: "cohort", label: "Chapter" }));
  });

  test("unknown words are refused", () => {
    expect(validateTermsInput({ terms: { widget: "X" } }).ok).toBe(false);
    expect(validateTermsInput({ terms: { student: "<b>" } }).ok).toBe(false);
    expect(validateTermsInput({ terms: { student: "Youth leader" } })).toEqual({ ok: true, terms: { student: "Youth leader" } });
  });
});

describe("checklist dismiss", () => {
  test("owner/admin only; stored on the active org", async () => {
    perms = new Set([]);
    expect((await postChecklist(req("/x", "POST", { dismissed: true }))).status).toBe(403);
    perms = new Set(["org.manage"]);
    expect((await postChecklist(req("/x", "POST", { dismissed: true }))).status).toBe(200);
    expect(checklistDismissed(db.tables.orgs.find((o) => o.id === ORG_A)!.settings as Record<string, unknown>)).toBe(true);
    expect(checklistDismissed(db.tables.orgs.find((o) => o.id === ORG_B)!.settings as Record<string, unknown>)).toBe(false);
    await postChecklist(req("/x", "POST", { dismissed: false }));
    expect(checklistDismissed(db.tables.orgs.find((o) => o.id === ORG_A)!.settings as Record<string, unknown>)).toBe(false);
  });
});

describe("identity rules (pure)", () => {
  test("validate and merge", () => {
    const v = validateIdentityInput(ORG_BODY);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const merged = mergeIdentityIntoSettings({ email_domain: "x.example.org", legal_name: "Old" }, v.value);
    const id = readOrgIdentity({ name: "Harbor", settings: merged });
    expect(identityComplete(id)).toBe(true);
    expect(merged.email_domain).toBe("x.example.org");
    expect(identityComplete(readOrgIdentity({ name: "Harbor", settings: { legal_name: "X", ein: "12-3456789" } }))).toBe(false);
    expect(validateIdentityInput({ ...ORG_BODY, timezone: "Mars/Base" }).ok).toBe(false);
  });

  test("the receipt identity uses the Organization address when Comms has none", () => {
    const comms = {
      org_id: ORG_A, from_name: "", from_email: "maya@harbor.example.org", reply_to: null, mailing_address: "",
      footer_text: null, transport: "gmail", sender_connected: true,
    } as unknown as Parameters<typeof buildOrgEmailIdentity>[1];
    const r = buildOrgEmailIdentity(
      { id: ORG_A, name: "Harbor", slug: "harbor", settings: { legal_name: "Harbor Inc.", ein: "12-3456789", mailing_address: "88 Wharf Street, Portland, ME 04101" } },
      comms,
      "receipt",
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.identity.letterhead).toBe("88 Wharf Street, Portland, ME 04101 · EIN 12-3456789");
  });

  test("connections: one status and one next step per system", () => {
    const rows = connectionRows({ gmail: { state: "none" }, calendar: { connected: false, accounts: [], lastSyncedAt: null }, hubspot: null });
    expect(rows.map((r) => r.key)).toEqual(["gmail", "calendar", "hubspot"]);
    expect(rows[0]).toMatchObject({ tone: "attention", action: { label: "Connect Gmail" } });
    expect(rows[2].status).toMatch(/Not available/);
    const on = connectionRows({
      gmail: { state: "active", accountEmail: "maya@harbor.example.org", reason: null },
      calendar: { connected: true, accounts: ["maya@harbor.example.org"], lastSyncedAt: "2026-11-20T10:00:00Z" },
      hubspot: { syncOut: true, syncIn: false },
    });
    expect(on.every((r) => r.tone === "ok")).toBe(true);
    expect(on[2].status).toBe("Connected. Syncing from BloomOS to HubSpot.");
    expect(connectionRows({ gmail: null, calendar: null, hubspot: null })[0].tone).toBe("off");
  });
});
