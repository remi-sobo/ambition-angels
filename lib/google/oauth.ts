import { google, type calendar_v3 } from "googleapis";

/**
 * In-app Google OAuth consent flow for connecting calendars (Settings →
 * Google Calendar). Replaces the old env-token adoption: the user is sent to
 * Google's own account chooser, so no account is ever hardcoded or
 * pre-selected.
 *
 * The redirect URI (`/api/admin/agenda/connect-google/callback` on the ADMIN
 * app origin) must be registered on the Google OAuth client in the Cloud
 * console — e.g. https://app.bloomos.org/api/admin/agenda/connect-google/callback.
 */

/** Full calendar scope: calendarList read for the picker, event read for sync,
 *  event write for BloomOS task blocks. Matches the scope of the legacy token. */
export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

/** CSRF state cookie set on /start and verified on /callback. */
export const OAUTH_STATE_COOKIE = "gcal_oauth_state";

/** Google's OAuth2 token endpoint — used directly by the credential preflight. */
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** invalid_client explanation, shared by the preflight and the callback catch so
 *  a mismatched client id/secret always reads the same way. */
export const INVALID_CLIENT_REASON =
  "Google rejected the server's OAuth credentials (invalid_client) — GOOGLE_CLIENT_SECRET doesn't match GOOGLE_CLIENT_ID. Fix the pair in Vercel and redeploy.";

/** Env credentials, trimmed — a trailing newline pasted into Vercel is a common
 *  cause of invalid_client, so never trust the raw value. */
function clientId(): string {
  return (process.env.GOOGLE_CLIENT_ID || "").trim();
}
function clientSecret(): string {
  return (process.env.GOOGLE_CLIENT_SECRET || "").trim();
}

export function oauthRedirectUri(requestOrigin: string): string {
  // The connect flow is an ADMIN surface: /start sets the CSRF state cookie and
  // /callback both live on the admin app origin. Build from APP_ORIGIN (the
  // admin host — https://app.bloomos.org post-cutover), NOT NEXT_PUBLIC_SITE_URL
  // (the marketing host, www.ambitionangels.org): sending Google a redirect_uri
  // on the marketing origin fails as redirect_uri_mismatch for anyone on the
  // admin domain, and would land the callback on an origin that never saw the
  // state cookie. Fall back to the live request origin when APP_ORIGIN is unset
  // (local dev / preview) — that's always the exact host the flow is running on.
  const base = (process.env.APP_ORIGIN || requestOrigin).replace(/\/+$/, "");
  return `${base}/api/admin/agenda/connect-google/callback`;
}

export function oauthClient(requestOrigin: string) {
  return new google.auth.OAuth2(
    clientId(),
    clientSecret(),
    oauthRedirectUri(requestOrigin)
  );
}

/**
 * Cheap credential preflight for /start: probe Google's token endpoint with a
 * throwaway grant BEFORE dragging the user through the consent screen. The
 * consent screen only validates client_id + redirect_uri, so a wrong
 * GOOGLE_CLIENT_SECRET isn't caught until the callback's token exchange —
 * after the user has clicked all the way through. This surfaces it up front.
 *
 * The probe sends an obviously-invalid refresh token: if the client id/secret
 * pair is wrong Google answers `invalid_client`; if the pair is fine it answers
 * `invalid_grant` (bad token) — which is exactly what we want to see. Anything
 * else (network hiccup, rate limit) fails open so a transient blip never blocks
 * a legitimate connect.
 */
export type OAuthPreflight = { ok: true } | { ok: false; reason: string };

export async function preflightOAuthCredentials(): Promise<OAuthPreflight> {
  const id = clientId();
  const secret = clientSecret();
  if (!id || !secret) {
    return { ok: false, reason: "Google OAuth is not configured on the server." };
  }
  try {
    const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: "bloomos-preflight-probe",
        client_id: id,
        client_secret: secret,
      }),
    });
    if (res.ok) return { ok: true }; // creds clearly fine (unexpected, but pass)
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (body.error === "invalid_client") {
      return { ok: false, reason: INVALID_CLIENT_REASON };
    }
    // invalid_grant (expected) or anything else → client authentication is fine.
    return { ok: true };
  } catch {
    // Transient network failure on the probe — don't block the connect flow.
    return { ok: true };
  }
}

/**
 * The Google consent URL. `select_account` forces the account chooser (never a
 * silent login as whoever is cached); `consent` + `access_type=offline`
 * guarantees a refresh token is issued even on re-connects.
 */
export function buildConsentUrl(requestOrigin: string, state: string): string {
  return oauthClient(requestOrigin).generateAuthUrl({
    access_type: "offline",
    prompt: "consent select_account",
    scope: [GOOGLE_CALENDAR_SCOPE],
    state,
  });
}

export type CalendarChoice = {
  id: string;
  label: string;
  primary: boolean;
  accessRole: string;
};

/** All calendars visible to a refresh token's account, for the picker. */
export async function listAccountCalendars(refreshToken: string): Promise<CalendarChoice[]> {
  const auth = new google.auth.OAuth2(clientId(), clientSecret());
  auth.setCredentials({ refresh_token: refreshToken });
  const cal = google.calendar({ version: "v3", auth });

  const items: calendar_v3.Schema$CalendarListEntry[] = [];
  let pageToken: string | undefined;
  do {
    const res = await cal.calendarList.list({ minAccessRole: "reader", pageToken });
    items.push(...(res.data.items ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return items
    .filter((c) => typeof c.id === "string" && c.id)
    .map((c) => ({
      id: c.id as string,
      label: c.summaryOverride ?? c.summary ?? (c.id as string),
      primary: c.primary === true,
      accessRole: c.accessRole ?? "reader",
    }));
}
