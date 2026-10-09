/**
 * QuickBooks Online OAuth + the read-only API client.
 *
 * Read-only is enforced HERE, in code: Intuit's only accounting scope
 * (com.intuit.quickbooks.accounting) is technically read/write, so the
 * guarantee lives in qboGet(), which only ever issues GET and only against the
 * two allowlisted reads below (the P&L Detail report and a Bank-account query).
 * No budget, Class, or reconciliation endpoint is reachable from BloomOS;
 * tests/quickbooks.test.ts pins the allowlist.
 *
 * Env:
 *   QBO_CLIENT_ID, QBO_CLIENT_SECRET  Intuit developer app keys
 *   QBO_ENVIRONMENT                   "production" (default) | "sandbox"
 * The redirect URI (`/api/admin/finance/quickbooks/callback` on the admin app
 * origin, e.g. https://app.bloomos.org/api/admin/finance/quickbooks/callback)
 * must be registered on the Intuit app.
 */
import type { QboReport } from "./register";

export const QBO_SCOPE = "com.intuit.quickbooks.accounting";
export const QBO_OAUTH_STATE_COOKIE = "qbo_oauth_state";
export const QBO_CALLBACK_PATH = "/api/admin/finance/quickbooks/callback";

const AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const MINOR_VERSION = "75";

function clientId(): string {
  return (process.env.QBO_CLIENT_ID || "").trim();
}
function clientSecret(): string {
  return (process.env.QBO_CLIENT_SECRET || "").trim();
}

export function isQboConfigured(): boolean {
  return !!clientId() && !!clientSecret();
}

function apiBase(): string {
  return (process.env.QBO_ENVIRONMENT || "").trim() === "sandbox"
    ? "https://sandbox-quickbooks.api.intuit.com"
    : "https://quickbooks.api.intuit.com";
}

/** Same origin rule as the Google connect flow (lib/google/oauth.ts): the admin
 *  host from APP_ORIGIN, else the live request origin (dev / preview). */
export function qboRedirectUri(requestOrigin: string): string {
  const base = (process.env.APP_ORIGIN || requestOrigin).replace(/\/+$/, "");
  return `${base}${QBO_CALLBACK_PATH}`;
}

export function buildQboConsentUrl(requestOrigin: string, state: string): string {
  const u = new URL(AUTHORIZE_URL);
  u.searchParams.set("client_id", clientId());
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", QBO_SCOPE);
  u.searchParams.set("redirect_uri", qboRedirectUri(requestOrigin));
  u.searchParams.set("state", state);
  return u.toString();
}

export type QboTokens = {
  accessToken: string;
  refreshToken: string;
  /** Access token expiry (epoch ms). */
  expiresAt: number;
  /** Refresh token expiry (epoch ms); Intuit rotates it, ~100 days. */
  refreshExpiresAt: number;
};

async function tokenRequest(body: Record<string, string>): Promise<QboTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${clientId()}:${clientSecret()}`).toString("base64"),
    },
    body: new URLSearchParams(body),
    cache: "no-store",
  });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof j.access_token !== "string" || typeof j.refresh_token !== "string") {
    const reason = String(j.error ?? `token request failed (${res.status})`);
    // 400/401 (invalid_grant, invalid_client) means the grant itself is dead;
    // anything else is transient and must not force a reconnect.
    throw res.status === 400 || res.status === 401 ? new QboAuthError(reason) : new Error(reason);
  }
  const now = Date.now();
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresAt: now + Number(j.expires_in ?? 3600) * 1000,
    refreshExpiresAt: now + Number(j.x_refresh_token_expires_in ?? 8_640_000) * 1000,
  };
}

/** Thrown when Intuit rejects our grant: the connection needs a reconnect. */
export class QboAuthError extends Error {}

export function exchangeQboCode(code: string, requestOrigin: string): Promise<QboTokens> {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: qboRedirectUri(requestOrigin) });
}

export function refreshQboTokens(refreshToken: string): Promise<QboTokens> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

// ── The read allowlist ──────────────────────────────────────────────────────

/**
 * The only API paths BloomOS may read (relative to /v3/company/{realmId}/).
 * Register: ProfitAndLossDetail. Cash: the `query` endpoint, and only for a
 * Bank-account select (see BANK_ACCOUNT_QUERY).
 */
export const QBO_ALLOWED_READS = ["reports/ProfitAndLossDetail", "query"] as const;
export type QboRead = (typeof QBO_ALLOWED_READS)[number];

export const BANK_ACCOUNT_QUERY =
  "select * from Account where AccountType = 'Bank' and Active = true maxresults 1000";

/** Throws unless (path, params) is one of the two narrow reads. Pure. */
export function assertAllowedQboRead(path: string, params: Record<string, string>): asserts path is QboRead {
  if (!(QBO_ALLOWED_READS as readonly string[]).includes(path)) {
    throw new Error(`QuickBooks read not allowed: ${path}`);
  }
  if (path === "query" && params.query !== BANK_ACCOUNT_QUERY) {
    throw new Error("QuickBooks query not allowed: only the bank-account balance query is permitted");
  }
}

/** GET-only, allowlisted QBO read. */
async function qboGet<T>(
  realmId: string,
  accessToken: string,
  path: string,
  params: Record<string, string>
): Promise<T> {
  assertAllowedQboRead(path, params);
  const u = new URL(`${apiBase()}/v3/company/${encodeURIComponent(realmId)}/${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("minorversion", MINOR_VERSION);
  const res = await fetch(u, {
    method: "GET",
    headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (res.status === 401) throw new QboAuthError("QuickBooks rejected the access token");
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`QuickBooks ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/** Cash-basis P&L Detail for [start, end]: the account-assigned register. */
export function fetchProfitAndLossDetail(
  realmId: string,
  accessToken: string,
  start: string,
  end: string
): Promise<QboReport> {
  return qboGet<QboReport>(realmId, accessToken, "reports/ProfitAndLossDetail", {
    start_date: start,
    end_date: end,
    accounting_method: "Cash",
  });
}

export async function fetchBankAccounts(
  realmId: string,
  accessToken: string
): Promise<{ Name?: string; AccountType?: string; Active?: boolean; CurrentBalance?: number }[]> {
  const j = await qboGet<{ QueryResponse?: { Account?: [] } }>(realmId, accessToken, "query", {
    query: BANK_ACCOUNT_QUERY,
  });
  return j.QueryResponse?.Account ?? [];
}
