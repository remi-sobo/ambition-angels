import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { google } from "googleapis";
import { fakeDb, type FakeDb } from "./support/fakeDb";

// The Gmail read sync uses only the separate Internal OAuth client
// (GMAIL_SYNC_CLIENT_ID / GMAIL_SYNC_CLIENT_SECRET) and a mailbox token stored
// in `connections`. It never falls back to the "bloom / meet" client or
// GOOGLE_REFRESH_TOKEN, and its consent asks for gmail.readonly alone.

const AA = "00000000-0000-0000-0000-0000000000aa";
let admin: FakeDb = fakeDb();
let ctx: { userId: string; email: string; orgId: string; orgName: string; role: "owner" } | null = null;
let canManage = true;

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => admin.client }));
vi.mock("@/lib/admin/auth", () => ({
  getOrgContext: vi.fn(async () => ctx),
  ctxHasPermission: vi.fn(async () => canManage),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));

import {
  buildGmailSyncConsentUrl,
  GMAIL_READONLY_SCOPE,
  GMAIL_SYNC_STATE_COOKIE,
} from "@/lib/google/gmail-sync-oauth";
import { getGmailReadClient, upsertGmailSyncConnection } from "@/lib/google/gmail-sync-connection";
import { advanceGmailJob, createGmailJob, NO_MAILBOX_MESSAGE } from "@/lib/fundraising/gmail-sync";
import { GET as startGET } from "@/app/api/admin/fundraising/gmail-sync/connect/start/route";
import { GET as callbackGET } from "@/app/api/admin/fundraising/gmail-sync/connect/callback/route";

const nreq = (url: string, cookie?: string) =>
  new NextRequest(`https://app.example.org${url}`, cookie ? { headers: { cookie } } : undefined);

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.GMAIL_SYNC_CLIENT_ID = "internal-client-id";
  process.env.GMAIL_SYNC_CLIENT_SECRET = "internal-client-secret";
  process.env.GOOGLE_CLIENT_ID = "bloom-meet-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "bloom-meet-secret";
  process.env.GOOGLE_REFRESH_TOKEN = "bloom-meet-refresh";
  process.env.BLOOMOS_TOKEN_ENC_KEY = randomBytes(32).toString("base64");
  delete process.env.APP_ORIGIN;
  delete process.env.STAFF_EMAIL_DOMAIN;
  ctx = { userId: "u1", email: "u@ambitionangels.org", orgId: AA, orgName: "AA", role: "owner" };
  canManage = true;
  admin = fakeDb({
    org_entitlements: [{ org_id: AA, feature_key: "aa.hubspot_mirror", enabled: true }],
    connections: [],
  });
});

describe("consent URL", () => {
  test("uses the Internal client and asks for gmail.readonly only", () => {
    const url = new URL(buildGmailSyncConsentUrl("https://app.example.org", "s1"));
    expect(url.searchParams.get("client_id")).toBe("internal-client-id");
    expect(url.searchParams.get("scope")).toBe(GMAIL_READONLY_SCOPE);
    expect(url.searchParams.get("include_granted_scopes")).toBe("false");
    expect(url.searchParams.get("hd")).toBe("ambitionangels.org");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.example.org/api/admin/fundraising/gmail-sync/connect/callback",
    );
  });
});

describe("no fallback to the bloom / meet token", () => {
  test("with no mailbox connected, the sync fails with a plain reason and never builds a Gmail client", async () => {
    const gmailSpy = vi.spyOn(google, "gmail");
    expect(await getGmailReadClient(AA)).toBeNull();
    const job = await createGmailJob(admin.client, { orgId: AA, mode: "backfill", watermark: 0 });
    const done = await advanceGmailJob(admin.client, job);
    expect(done.status).toBe("failed");
    expect(done.errors.at(-1)?.message).toBe(NO_MAILBOX_MESSAGE);
    expect(gmailSpy).not.toHaveBeenCalled();
  });

  test("without the Internal client env, a stored token is not used", async () => {
    await upsertGmailSyncConnection({
      orgId: AA, userId: "u1", connectedByEmail: "u@ambitionangels.org",
      accountEmail: "remi@ambitionangels.org", refreshToken: "internal-refresh", scope: GMAIL_READONLY_SCOPE,
    });
    delete process.env.GMAIL_SYNC_CLIENT_ID;
    expect(await getGmailReadClient(AA)).toBeNull();
  });

  test("a connected mailbox is read with the Internal client, token stored encrypted", async () => {
    await upsertGmailSyncConnection({
      orgId: AA, userId: "u1", connectedByEmail: "u@ambitionangels.org",
      accountEmail: "remi@ambitionangels.org", refreshToken: "internal-refresh", scope: GMAIL_READONLY_SCOPE,
    });
    const row = admin.tables.connections[0];
    expect(row.provider).toBe("google_gmail_read");
    expect(JSON.stringify(row)).not.toContain("internal-refresh");

    const gmail = await getGmailReadClient(AA);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auth = (gmail as any).context._options.auth;
    expect(auth._clientId).toBe("internal-client-id");
    expect(auth.credentials.refresh_token).toBe("internal-refresh");
  });
});

describe("connect routes", () => {
  test("start redirects to Google with a state cookie", async () => {
    const res = await startGET(nreq("/api/admin/fundraising/gmail-sync/connect/start"));
    const loc = new URL(res.headers.get("location") ?? "");
    expect(loc.hostname).toBe("accounts.google.com");
    expect(loc.searchParams.get("client_id")).toBe("internal-client-id");
    expect(res.cookies.get(GMAIL_SYNC_STATE_COOKIE)?.value).toBe(loc.searchParams.get("state"));
  });

  test("start refuses a non-admin, a non-owner org, and a missing Internal client", async () => {
    canManage = false;
    expect((await startGET(nreq("/x"))).headers.get("location")).toContain("gmail_sync=error");
    canManage = true;
    admin.tables.org_entitlements = [];
    expect((await startGET(nreq("/x"))).headers.get("location")).toContain("gmail_sync=error");
    admin.tables.org_entitlements = [{ org_id: AA, feature_key: "aa.hubspot_mirror", enabled: true }];
    delete process.env.GMAIL_SYNC_CLIENT_SECRET;
    expect((await startGET(nreq("/x"))).headers.get("location")).toContain("gmail_sync=error");
  });

  const cb = (q: string, state = "st") =>
    callbackGET(nreq(`/api/admin/fundraising/gmail-sync/connect/callback?${q}`, `${GMAIL_SYNC_STATE_COOKIE}=${state}`));

  const mockGoogle = (scope: string, email: string, refresh: string | null = "new-refresh") => {
    vi.spyOn(google.auth.OAuth2.prototype, "getToken").mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (async () => ({ tokens: { scope, refresh_token: refresh, access_token: "a" } })) as any,
    );
    vi.spyOn(google, "gmail").mockReturnValue({
      users: { getProfile: vi.fn(async () => ({ data: { emailAddress: email } })) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  };

  test("callback stores the mailbox on success", async () => {
    mockGoogle(GMAIL_READONLY_SCOPE, "Remi@AmbitionAngels.org");
    const res = await cb("code=c&state=st");
    expect(res.headers.get("location")).toContain("gmail_sync=connected");
    expect(admin.tables.connections).toHaveLength(1);
    expect(admin.tables.connections[0].meta).toMatchObject({ account_email: "remi@ambitionangels.org", oauth_client: "internal" });
  });

  test("callback rejects a mismatched state, a missing scope, no refresh token, and an outside mailbox", async () => {
    mockGoogle(GMAIL_READONLY_SCOPE, "remi@ambitionangels.org");
    expect((await cb("code=c&state=other")).headers.get("location")).toContain("gmail_sync=error");

    mockGoogle("https://www.googleapis.com/auth/gmail.send", "remi@ambitionangels.org");
    expect((await cb("code=c&state=st")).headers.get("location")).toContain("gmail_sync=error");

    mockGoogle(GMAIL_READONLY_SCOPE, "remi@ambitionangels.org", null);
    expect((await cb("code=c&state=st")).headers.get("location")).toContain("gmail_sync=error");

    mockGoogle(GMAIL_READONLY_SCOPE, "someone@gmail.com");
    expect((await cb("code=c&state=st")).headers.get("location")).toContain("gmail_sync=error");

    expect(admin.tables.connections).toEqual([]);
  });
});
