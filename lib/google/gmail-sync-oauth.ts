import { google, type gmail_v1 } from "googleapis";
import { adminOrigin } from "@/lib/google/oauth";

/**
 * The Gmail READ sync's own OAuth client: an Internal app in a separate Google
 * Cloud project under the ambitionangels.org Workspace. Internal apps can hold
 * the restricted gmail.readonly scope without Google verification, and only
 * accounts in that Workspace can authorize them.
 *
 * This is deliberately NOT the "bloom / meet" client (GOOGLE_CLIENT_ID /
 * GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN), which only ever asks for
 * calendar and gmail.send. Nothing in this file reads those env vars, and the
 * sync never falls back to them.
 *
 * Env (Vercel, server only):
 *   GMAIL_SYNC_CLIENT_ID, GMAIL_SYNC_CLIENT_SECRET  — the Internal client
 * Redirect URI to register on that client:
 *   https://app.bloomos.org/api/admin/fundraising/gmail-sync/connect/callback
 */

export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_SYNC_SCOPES = [GMAIL_READONLY_SCOPE];

export const GMAIL_SYNC_CONNECT_PATH = "/api/admin/fundraising/gmail-sync/connect";
export const GMAIL_SYNC_STATE_COOKIE = "gmail_sync_oauth_state";
export const GMAIL_SYNC_PAGE_PATH = "/admin/fundraising/today";

/** The Workspace the Internal app lives in. Consent is pinned to it. */
export function gmailSyncWorkspaceDomain(): string {
  return (process.env.STAFF_EMAIL_DOMAIN || "ambitionangels.org").trim().toLowerCase();
}

function clientId(): string {
  return (process.env.GMAIL_SYNC_CLIENT_ID || "").trim();
}
function clientSecret(): string {
  return (process.env.GMAIL_SYNC_CLIENT_SECRET || "").trim();
}

export function isGmailSyncClientConfigured(): boolean {
  return !!clientId() && !!clientSecret();
}

export function gmailSyncRedirectUri(requestOrigin: string): string {
  return `${adminOrigin(requestOrigin)}${GMAIL_SYNC_CONNECT_PATH}/callback`;
}

export function gmailSyncOAuthClient(redirectUri?: string) {
  return new google.auth.OAuth2(clientId(), clientSecret(), redirectUri);
}

/** Account chooser forced, pinned to the Workspace domain, gmail.readonly only,
 *  and include_granted_scopes off so no other scope rides along. */
export function buildGmailSyncConsentUrl(requestOrigin: string, state: string): string {
  return gmailSyncOAuthClient(gmailSyncRedirectUri(requestOrigin)).generateAuthUrl({
    access_type: "offline",
    prompt: "consent select_account",
    scope: GMAIL_SYNC_SCOPES,
    include_granted_scopes: false,
    hd: gmailSyncWorkspaceDomain(),
    state,
  });
}

export function hasGmailReadScope(grantedScope: string | null | undefined): boolean {
  return (grantedScope ?? "").split(/\s+/).includes(GMAIL_READONLY_SCOPE);
}

/** A Gmail client acting through the Internal app with a stored refresh token. */
export function gmailReadClientFor(refreshToken: string): gmail_v1.Gmail {
  const auth = gmailSyncOAuthClient();
  auth.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: "v1", auth });
}
