import { adminOrigin, googleOAuthClientFor, GOOGLE_CALENDAR_SCOPE } from "@/lib/google/oauth";
import { GMAIL_SEND_SCOPE } from "@/lib/comms/gmail-oauth";

/**
 * Scheduler Google account (Settings → Connections): the one Google account
 * the public /meet scheduler acts as. It writes booking events to that
 * account's calendar and sends confirmation, reschedule, cancel and reminder
 * emails from it. Replaces copying a refresh token into the
 * GOOGLE_REFRESH_TOKEN env var by hand; the env var stays as a fallback.
 *
 * Only two scopes are asked for: full calendar (free/busy, create, move,
 * cancel events) and gmail.send (send only, never read). No openid/email:
 * the account is identified by its primary calendar id, which is its email.
 *
 * The redirect URI must be registered on the Google OAuth client, e.g.
 * https://app.bloomos.org/api/admin/scheduler/connect-google/callback.
 */

export const SCHEDULER_SCOPES = [GOOGLE_CALENDAR_SCOPE, GMAIL_SEND_SCOPE];

export const SCHEDULER_CONNECT_PATH = "/api/admin/scheduler/connect-google";
export const SCHEDULER_STATE_COOKIE = "gsched_oauth_state";
export const SCHEDULER_PAGE_PATH = "/admin/settings/connections";

export function schedulerRedirectUri(requestOrigin: string): string {
  return `${adminOrigin(requestOrigin)}${SCHEDULER_CONNECT_PATH}/callback`;
}

export function schedulerOAuthClient(requestOrigin: string) {
  return googleOAuthClientFor(schedulerRedirectUri(requestOrigin));
}

/** Account chooser forced (never a silent connect as whoever is signed in to
 *  Google); offline + consent guarantees a refresh token on a reconnect. */
export function buildSchedulerConsentUrl(requestOrigin: string, state: string): string {
  return schedulerOAuthClient(requestOrigin).generateAuthUrl({
    access_type: "offline",
    prompt: "consent select_account",
    scope: SCHEDULER_SCOPES,
    include_granted_scopes: false,
    state,
  });
}

/** Scopes Google's granular consent let the person untick. Empty means the
 *  grant can do everything the scheduler needs. */
export function missingSchedulerScopes(grantedScope: string | null | undefined): string[] {
  const granted = new Set((grantedScope ?? "").split(/\s+/).filter(Boolean));
  return SCHEDULER_SCOPES.filter((s) => !granted.has(s));
}
