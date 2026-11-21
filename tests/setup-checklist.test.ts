import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checklistView, setupSteps, showChecklist, DONORS_ALREADY_IN, type SetupFacts } from "@/lib/admin/setupChecklist";
import { fakeDb } from "./support/fakeDb";

// V4 Stage F: the Home setup checklist. Each step finishes from real data;
// the only manual control is "Finish later".

const FRESH: SetupFacts = {
  identityComplete: false,
  identityLine: null,
  memberCount: 1,
  commsOn: true,
  gmail: "none",
  gmailAccount: null,
  fundraisingOn: true,
  captureOn: true,
  donorImportsDone: 0,
  donorCount: 0,
  giftCount: 0,
  capturesDone: 0,
  dismissed: false,
  supportEmail: null,
};

const done = (f: SetupFacts) => Object.fromEntries(setupSteps(f).map((s) => [s.key, s.done]));

describe("completion per step", () => {
  test("a fresh org: nothing done, five steps, 17 minutes", () => {
    const v = checklistView(FRESH);
    expect(v.steps.map((s) => s.title)).toEqual([
      "Confirm your organization", "Invite a teammate", "Connect Gmail", "Bring in your donors", "Record your first gift",
    ]);
    expect(v.doneCount).toBe(0);
    expect(v.minutesLeft).toBe(17);
    expect(showChecklist(FRESH, true)).toBe(true);
  });

  test("1. organization: legal name, address and EIN", () => {
    expect(done({ ...FRESH, identityComplete: true }).organization).toBe(true);
  });

  test("2. teammate: two or more members, an open invite counts", () => {
    expect(done({ ...FRESH, memberCount: 1 }).teammate).toBe(false);
    expect(done({ ...FRESH, memberCount: 2 }).teammate).toBe(true);
  });

  test("3. gmail: active only; an error is not done; not needed without Comms", () => {
    expect(done({ ...FRESH, gmail: "error" }).gmail).toBe(false);
    expect(done({ ...FRESH, gmail: "active" }).gmail).toBe(true);
    const off = setupSteps({ ...FRESH, commsOn: false }).find((s) => s.key === "gmail")!;
    expect(off).toMatchObject({ done: true, notNeeded: true });
  });

  test("4. donors: a finished import that created records, or 25+ donors already", () => {
    expect(done({ ...FRESH, donorCount: 3 }).donors).toBe(false);
    expect(done({ ...FRESH, donorImportsDone: 1, donorCount: 3 }).donors).toBe(true);
    expect(done({ ...FRESH, donorCount: DONORS_ALREADY_IN }).donors).toBe(true);
  });

  test("5. first gift: a gift, or a finished Talk to log capture", () => {
    expect(done({ ...FRESH, giftCount: 1 }).first_gift).toBe(true);
    expect(done({ ...FRESH, capturesDone: 1 }).first_gift).toBe(true);
    const offBoth = setupSteps({ ...FRESH, fundraisingOn: false, captureOn: false }).find((s) => s.key === "first_gift")!;
    expect(offBoth.notNeeded).toBe(true);
  });

  test("the panel goes when all five are done, or when dismissed, and never shows to staff", () => {
    const all: SetupFacts = { ...FRESH, identityComplete: true, memberCount: 3, gmail: "active", donorImportsDone: 1, giftCount: 4 };
    expect(checklistView(all).allDone).toBe(true);
    expect(showChecklist(all, true)).toBe(false);
    expect(showChecklist({ ...FRESH, dismissed: true }, true)).toBe(false);
    expect(showChecklist(FRESH, false)).toBe(false);
  });

  test("every step links to its screen", () => {
    const hrefs = Object.fromEntries(setupSteps(FRESH).map((s) => [s.key, s.action.href]));
    expect(hrefs).toEqual({
      organization: "/admin/settings/organization",
      teammate: "/admin/settings/people",
      gmail: "/admin/comms/settings",
      donors: "/admin/settings/imports/csv?target=gift",
      first_gift: "/admin/fundraising/donors-funders",
    });
  });
});

// The loader reads real rows, pinned to the active org.
const ORG_A = "00000000-0000-0000-0000-00000000000a";
const ORG_B = "00000000-0000-0000-0000-00000000000b";
let db = fakeDb();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => db.client }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => db.client }));
vi.mock("@/lib/comms/gmail-connection", () => ({
  getGmailConnectionStatus: vi.fn(async (orgId: string) =>
    orgId === ORG_B ? { state: "active", accountEmail: "b@example.org", connectedByEmail: null, connectedAt: null, reason: null } : { state: "none" },
  ),
}));
vi.mock("@/lib/admin/auth", () => ({ getOrgContext: vi.fn(async () => null) }));

describe("loader: real data, active org only", () => {
  test("org B's rows never finish org A's steps", async () => {
    const both = (r: Record<string, unknown>) => r.org_id === ORG_A || r.org_id === ORG_B || r.id === ORG_A || r.id === ORG_B;
    db = fakeDb(
      {
        orgs: [
          { id: ORG_A, name: "Harbor", slug: "harbor", settings: {} },
          {
            id: ORG_B, name: "Other", slug: "other",
            settings: { legal_name: "Other Inc.", ein: "98-7654321", address: { street: "1 Main St", city: "Town", state: "CA", postal_code: "90000" } },
          },
        ],
        memberships: [
          { org_id: ORG_A, user_id: "u1", role: "owner" },
          { org_id: ORG_B, user_id: "u1", role: "owner" },
          { org_id: ORG_B, user_id: "u2", role: "staff" },
        ],
        imports: [{ id: "i1", org_id: ORG_B, entity_type: "gift", status: "done", counts: { created: 4 } }],
        constituents: [{ id: "c1", org_id: ORG_B }],
        gifts: [{ id: "g1", org_id: ORG_B }],
        captures: [{ id: "k1", org_id: ORG_B, status: "done" }],
      },
      { visible: { orgs: both, memberships: both, imports: both, constituents: both, gifts: both, captures: both } },
    );
    const { loadSetupFacts } = await import("@/lib/admin/setupChecklist-server");
    const ents = new Set(["modules.comms", "modules.fundraising", "ai.capture"]);
    const a = await loadSetupFacts(ORG_A, ents);
    expect(checklistView(a).doneCount).toBe(0);
    const b = await loadSetupFacts(ORG_B, ents);
    expect(b.identityComplete).toBe(true);
    expect(b.identityLine).toBe("Other Inc. · 1 Main St, Town, CA 90000 · EIN 98-7654321");
    expect(checklistView(b).allDone).toBe(true);
  });

  test("an undone import does not count", async () => {
    db = fakeDb({
      orgs: [{ id: ORG_A, name: "Harbor", slug: "harbor", settings: {} }],
      imports: [{ id: "i1", org_id: ORG_A, entity_type: "constituent", status: "undone", counts: { created: 9 } }],
    });
    const { loadSetupFacts } = await import("@/lib/admin/setupChecklist-server");
    const a = await loadSetupFacts(ORG_A, new Set(["modules.fundraising"]));
    expect(a.donorImportsDone).toBe(0);
  });
});

describe("Today wiring", () => {
  test("the panel is guarded by org.manage and only reads after the check", () => {
    const src = readFileSync(join(__dirname, "../app/admin/today/page.tsx"), "utf8");
    const guard = src.indexOf('ctxHasPermission(ctx, "org.manage")');
    expect(guard).toBeGreaterThan(0);
    expect(src.indexOf("loadSetupFacts(")).toBeGreaterThan(guard);
    expect(src).toMatch(/canManageOrg \? await loadSetupFacts/);
  });
});
