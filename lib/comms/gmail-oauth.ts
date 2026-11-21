import { adminOrigin, googleOAuthClientFor } from "@/lib/google/oauth";

/**
 * Connect Gmail (Comms settings, specs/comms-v2-gmail-amendment.md G1): an
 * org manager sends BloomOS permission to send mail as one Google account the
 * org controls. Campaigns then go out through the Gmail API as that account.
 *
 * Only `gmail.send` is asked for (a sensitive scope, not a restricted one):
 * BloomOS can send but can never read the inbox. `openid email` returns an
 * id_token naming the account, so no Gmail read call is needed to learn it.
 *
 * The redirect URI must be registered on the Google OAuth client, e.g.
 * https://app.bloomos.org/api/admin/comms/connect-gmail/callback, and
 * gmail.send must be listed on the OAuth consent screen.
 */

export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const GMAIL_CONNECT_SCOPES = [GMAIL_SEND_SCOPE, "openid", "email"];

export const GMAIL_CONNECT_PATH = "/api/admin/comms/connect-gmail";
export const GMAIL_STATE_COOKIE = "gmail_oauth_state";
export const COMMS_PAGE_PATH = "/admin/comms/emails";

export function gmailRedirectUri(requestOrigin: string): string {
  return `${adminOrigin(requestOrigin)}${GMAIL_CONNECT_PATH}/callback`;
}

export function gmailOAuthClient(requestOrigin: string) {
  return googleOAuthClientFor(gmailRedirectUri(requestOrigin));
}

/** The consent URL: the account chooser is forced so nobody is connected by
 *  accident as whoever is signed in to Google, and offline + consent
 *  guarantees a refresh token even on a reconnect. */
export function buildGmailConsentUrl(requestOrigin: string, state: string): string {
  return gmailOAuthClient(requestOrigin).generateAuthUrl({
    access_type: "offline",
    prompt: "consent select_account",
    scope: GMAIL_CONNECT_SCOPES,
    include_granted_scopes: false,
    state,
  });
}

/** Google's granular consent lets a person untick "send email on your
 *  behalf" and still finish. A grant without gmail.send is useless, so the
 *  callback refuses it rather than storing a token that can't send. */
export function grantIncludesGmailSend(grantedScope: string | null | undefined): boolean {
  return (grantedScope ?? "").split(/\s+/).includes(GMAIL_SEND_SCOPE);
}
