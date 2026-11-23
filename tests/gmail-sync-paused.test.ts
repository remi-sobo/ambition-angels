import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { fakeDb, type FakeDb } from "./support/fakeDb";

// The Gmail → interactions sync is paused (lib/fundraising/gmail-sync-flag.ts):
// it read the mailbox with gmail.readonly, which the privacy policy says
// BloomOS does not do. While paused, nothing may call Gmail, create a job or
// write an interaction, and Vercel must not schedule the cron. Existing rows
// stay untouched.

const AA = "org-aa";
let admin: FakeDb = fakeDb();
let ctx: { userId: string; email: string; orgId: string; orgName: string; role: "owner" } | null = null;

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => admin.client }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => fakeDb().client }));
vi.mock("@/lib/admin/auth", () => ({
  getOrgContext: vi.fn(async () => ctx),
  getAdminUser: vi.fn(async () => "tester"),
  isAuthed: vi.fn(async () => !!ctx),
  ctxHasPermission: vi.fn(async () => true),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));
vi.mock("@/lib/google/gmail-read", () => ({
  listMessageIds: vi.fn(async () => ({ ids: ["m1"], nextPageToken: null })),
  getMessage: vi.fn(),
  counterpartyEmails: vi.fn(() => []),
  staffCoPresent: vi.fn(() => false),
}));

import { GMAIL_SYNC_PAUSED } from "@/lib/fundraising/gmail-sync-flag";
import { GET as cronGET } from "@/app/api/cron/gmail-sync/route";
import { GET as adminGET, POST as adminPOST } from "@/app/api/admin/fundraising/gmail-sync/route";
import { listMessageIds, getMessage } from "@/lib/google/gmail-read";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const req = (url: string, init?: RequestInit) => new Request(`http://localhost${url}`, init) as any;

const priorJob = {
  id: "job-1",
  org_id: AA,
  mailbox: "me",
  mode: "incremental",
  status: "completed",
  page_token: null,
  last_internal_date: 1_700_000_000_000,
  counts: { scanned: 10, logged: 2, skipped: 8, maxInternal: 1_700_000_000_000 },
  errors: [],
  started_at: "2026-11-20T00:00:00Z",
  finished_at: "2026-11-20T00:01:00Z",
};
const priorInteraction = { id: "i-1", org_id: AA, constituent_id: "c-aa", external_id: "gm-0" };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "cron-secret";
  ctx = { userId: "u1", email: "u@example.org", orgId: AA, orgName: AA, role: "owner" };
  admin = fakeDb({
    org_entitlements: [{ org_id: AA, feature_key: "aa.hubspot_mirror", enabled: true }],
    gmail_sync_jobs: [{ ...priorJob }],
    interactions: [{ ...priorInteraction }],
  });
});

describe("Gmail sync is paused", () => {
  test("the flag is on", () => {
    expect(GMAIL_SYNC_PAUSED).toBe(true);
  });

  test("vercel.json no longer schedules the cron", () => {
    const cfg = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
      crons: { path: string }[];
    };
    expect(cfg.crons.map((c) => c.path)).not.toContain("/api/cron/gmail-sync");
  });

  test("the cron still requires its secret", async () => {
    const res = await cronGET(req("/api/cron/gmail-sync"));
    expect(res.status).toBe(401);
  });

  test("the cron says paused and touches nothing", async () => {
    const res = await cronGET(req("/api/cron/gmail-sync", { headers: { authorization: "Bearer cron-secret" } }));
    const body = await res.json();
    expect(body.status).toBe("paused");
    expect(listMessageIds).not.toHaveBeenCalled();
    expect(getMessage).not.toHaveBeenCalled();
    expect(admin.tables.gmail_sync_jobs).toEqual([priorJob]);
    expect(admin.tables.interactions).toEqual([priorInteraction]);
  });

  test("the admin button cannot start or advance a sync", async () => {
    for (const body of [{}, { mode: "incremental" }, { jobId: "job-1" }]) {
      const res = await adminPOST(
        req("/api/admin/fundraising/gmail-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
      expect(res.status).toBe(503);
      expect((await res.json()).paused).toBe(true);
    }
    expect(listMessageIds).not.toHaveBeenCalled();
    expect(admin.tables.gmail_sync_jobs).toEqual([priorJob]);
    expect(admin.tables.interactions).toEqual([priorInteraction]);
  });

  test("the admin route still needs permission before saying paused", async () => {
    ctx = null;
    const res = await adminPOST(req("/api/admin/fundraising/gmail-sync", { method: "POST", body: "{}" }));
    expect(res.status).not.toBe(503);
    expect(res.status).toBeGreaterThanOrEqual(401);
  });

  test("history stays readable", async () => {
    const res = await adminGET();
    expect(res.status).toBe(200);
    expect((await res.json())?.id).toBe("job-1");
  });
});
