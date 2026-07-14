import { google, type calendar_v3 } from "googleapis";

/**
 * In-app Google OAuth consent flow for connecting calendars (Settings →
 * Google Calendar). Replaces the old env-token adoption: the user is sent to
 * Google's own account chooser, so no account is ever hardcoded or
 * pre-selected.
 *
 * The redirect URI (`/api/admin/agenda/connect-google/callback` on the site
 * origin) must be registered on the Google OAuth client in the Cloud console.
 */

/** Full calendar scope: calendarList read for the picker, event read for sync,
 *  event write for BloomOS task blocks. Matches the scope of the legacy token. */
export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

/** CSRF state cookie set on /start and verified on /callback. */
export const OAUTH_STATE_COOKIE = "gcal_oauth_state";

export function oauthRedirectUri(requestOrigin: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || requestOrigin).replace(/\/$/, "");
  return `${base}/api/admin/agenda/connect-google/callback`;
}

export function oauthClient(requestOrigin: string) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    oauthRedirectUri(requestOrigin)
  );
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
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
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
