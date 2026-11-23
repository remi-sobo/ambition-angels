import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The scheduler Google account (/meet) replaces the hand-copied env
// GOOGLE_REFRESH_TOKEN with a stored, reconnectable connection. These pin:
// stored token first with env fallback, only calendar + gmail.send asked for,
// disconnects never revoke a grant another connection uses, a refused stored
// token is marked broken, and Google errors are logged without tokens.

vi.mock("server-only", () => ({}));

const getActive = vi.fn();
const markBroken = vi.fn();
vi.mock("@/lib/google/scheduler-connection", () => ({
  getActiveSchedulerConnection: (...a: unknown[]) => getActive(...a),
  markSchedulerConnectionBroken: (...a: unknown[]) => markBroken(...a),
}));
vi.mock("@/lib/admin/orgs", () => ({ getResidentOrgId: async () => "org-aa" }));

import { pickSchedulerToken, resolveSchedulerToken, withSchedulerToken } from "@/lib/google/auth";
import {
  SCHEDULER_SCOPES,
  missingSchedulerScopes,
  schedulerRedirectUri,
  buildSchedulerConsentUrl,
} from "@/lib/google/scheduler-oauth";
import { GOOGLE_PROVIDERS, googleAccountStillInUse } from "@/lib/google/grant";
import { googleErrorSummary, isInvalidGrant, scrubSecrets } from "@/lib/google/log-safe";

const CAL = "https://www.googleapis.com/auth/calendar";
const SEND = "https://www.googleapis.com/auth/gmail.send";

describe("scheduler token choice", () => {
  it("prefers the stored connection over the env token", () => {
    expect(pickSchedulerToken({ id: "c1", refreshToken: "stored-t" }, "env-t")).toEqual({
      refreshToken: "stored-t",
      source: "stored",
      connectionId: "c1",
    });
  });

  it("falls back to the env token (trimmed) when nothing is stored", () => {
    expect(pickSchedulerToken(null, " env-t\n")).toEqual({ refreshToken: "env-t", source: "env", connectionId: null });
  });

  it("reports none when neither exists", () => {
    expect(pickSchedulerToken(null, "  ")).toEqual({ refreshToken: null, source: "none", connectionId: null });
    expect(pickSchedulerToken(null, undefined).source).toBe("none");
  });
});

describe("resolveSchedulerToken", () => {
  const saved = process.env.GOOGLE_REFRESH_TOKEN;
  beforeEach(() => {
    getActive.mockReset();
    process.env.GOOGLE_REFRESH_TOKEN = "env-t";
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.GOOGLE_REFRESH_TOKEN;
    else process.env.GOOGLE_REFRESH_TOKEN = saved;
  });

  it("reads the resident org's stored connection", async () => {
    getActive.mockResolvedValue({ id: "c1", orgId: "org-aa", accountEmail: "a@x.org", refreshToken: "stored-t" });
    const t = await resolveSchedulerToken();
    expect(getActive).toHaveBeenCalledWith("org-aa");
    expect(t.source).toBe("stored");
  });

  it("uses the env token when the stored lookup throws", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    getActive.mockRejectedValue(new Error("BLOOMOS_TOKEN_ENC_KEY missing"));
    const t = await resolveSchedulerToken();
    expect(t).toEqual({ refreshToken: "env-t", source: "env", connectionId: null });
    err.mockRestore();
  });
});

describe("withSchedulerToken", () => {
  beforeEach(() => markBroken.mockReset());
  const invalidGrant = Object.assign(new Error("invalid_grant"), {
    response: { status: 400, data: { error: "invalid_grant", error_description: "Token has been expired or revoked." } },
  });

  it("marks a refused stored token broken and rethrows", async () => {
    const token = { refreshToken: "t", source: "stored" as const, connectionId: "c1" };
    await expect(withSchedulerToken(token, () => Promise.reject(invalidGrant))).rejects.toBe(invalidGrant);
    expect(markBroken).toHaveBeenCalledWith("c1", expect.stringMatching(/Reconnect/));
  });

  it("leaves the connection alone for env tokens and other errors", async () => {
    const env = { refreshToken: "t", source: "env" as const, connectionId: null };
    await expect(withSchedulerToken(env, () => Promise.reject(invalidGrant))).rejects.toBe(invalidGrant);
    const stored = { refreshToken: "t", source: "stored" as const, connectionId: "c1" };
    await expect(withSchedulerToken(stored, () => Promise.reject(new Error("rateLimitExceeded")))).rejects.toThrow();
    expect(markBroken).not.toHaveBeenCalled();
  });

  it("returns the call's value", async () => {
    const env = { refreshToken: "t", source: "env" as const, connectionId: null };
    expect(await withSchedulerToken(env, async () => 42)).toBe(42);
  });
});

describe("scheduler OAuth", () => {
  const savedOrigin = process.env.APP_ORIGIN;
  afterEach(() => {
    if (savedOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = savedOrigin;
  });

  it("asks for exactly calendar and gmail.send", () => {
    expect([...SCHEDULER_SCOPES].sort()).toEqual([CAL, SEND].sort());
  });

  it("refuses a grant with a scope unticked", () => {
    expect(missingSchedulerScopes(`${CAL} ${SEND}`)).toEqual([]);
    expect(missingSchedulerScopes(CAL)).toEqual([SEND]);
    expect(missingSchedulerScopes(null)).toEqual([CAL, SEND]);
  });

  it("builds the callback on the admin origin", () => {
    process.env.APP_ORIGIN = "https://app.bloomos.org/";
    expect(schedulerRedirectUri("https://preview.example")).toBe(
      "https://app.bloomos.org/api/admin/scheduler/connect-google/callback"
    );
  });

  it("forces the account chooser and offline access, with no extra scopes", () => {
    process.env.APP_ORIGIN = "https://app.bloomos.org";
    const url = new URL(buildSchedulerConsentUrl("https://ignored", "st8"));
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent select_account");
    expect(url.searchParams.get("state")).toBe("st8");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.bloomos.org/api/admin/scheduler/connect-google/callback"
    );
    expect((url.searchParams.get("scope") ?? "").split(" ").sort()).toEqual([CAL, SEND].sort());
  });
});

describe("grant safety with the scheduler account", () => {
  const base = { envAccountEmail: null, envTokenConfigured: false };

  it("counts scheduler rows when deciding whether to revoke", () => {
    expect(GOOGLE_PROVIDERS).toContain("google_scheduler");
  });

  it("disconnecting Gmail keeps the grant when the scheduler uses the same account", () => {
    const rows = [
      { id: "gmail", status: "active", meta: { account_email: "remi@org.org" } },
      { id: "sched", status: "active", meta: { account_email: "remi@org.org" } },
    ];
    expect(googleAccountStillInUse({ ...base, accountEmail: "remi@org.org", excludeIds: ["gmail"], rows })).toBe(true);
  });

  it("disconnecting the scheduler keeps the grant when calendar uses the same account", () => {
    const rows = [
      { id: "sched", status: "active", meta: { account_email: "remi@org.org" } },
      { id: "cal", status: "active", meta: { account_email: "Remi@Org.org" } },
    ];
    expect(googleAccountStillInUse({ ...base, accountEmail: "remi@org.org", excludeIds: ["sched"], rows })).toBe(true);
  });

  it("revokes when the scheduler was the account's only use", () => {
    const rows = [{ id: "sched", status: "active", meta: { account_email: "remi@org.org" } }];
    expect(googleAccountStillInUse({ ...base, accountEmail: "remi@org.org", excludeIds: ["sched"], rows })).toBe(false);
  });
});

describe("Google error logging", () => {
  const FAKE_RT = "1//0gFAKEfakeFAKEfakeFAKEfakeFAKE";
  const gaxiosLike = Object.assign(new Error("invalid_grant"), {
    code: "400",
    config: {
      url: "https://oauth2.googleapis.com/token",
      body: `refresh_token=${encodeURIComponent(FAKE_RT)}&client_secret=shh&grant_type=refresh_token`,
      data: { refresh_token: FAKE_RT, client_secret: "shh" },
    },
    response: { status: 400, data: { error: "invalid_grant", error_description: "Token has been expired or revoked." } },
  });

  it("keeps status, code and message only", () => {
    expect(googleErrorSummary(gaxiosLike)).toBe("status 400 invalid_grant");
  });

  it("never includes the request's refresh token or client secret", () => {
    const s = googleErrorSummary(gaxiosLike);
    expect(s).not.toContain(FAKE_RT);
    expect(s).not.toContain("shh");
    expect(s).not.toContain("refresh_token");
  });

  it("scrubs token-shaped text out of messages", () => {
    const s = scrubSecrets(`failed refresh_token=${FAKE_RT}&client_secret=abc {"access_token":"ya29.x"} ${FAKE_RT}`);
    expect(s).not.toContain(FAKE_RT);
    expect(s).not.toContain("abc");
    expect(s).not.toContain("ya29.x");
    expect(s).toContain("refresh_token=[redacted]");
  });

  it("recognises invalid_grant", () => {
    expect(isInvalidGrant(gaxiosLike)).toBe(true);
    expect(isInvalidGrant(new Error("Request had insufficient authentication scopes."))).toBe(false);
  });

  it("handles non-errors", () => {
    expect(googleErrorSummary("boom")).toBe("boom");
    expect(googleErrorSummary(undefined)).toBe("undefined");
  });
});
