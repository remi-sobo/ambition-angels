import { google, type calendar_v3, type gmail_v1 } from "googleapis";

/**
 * Returns an OAuth2 client authenticated as remi@ambitionangels.org via a
 * long-lived refresh token. The googleapis library handles access-token
 * refresh automatically on each API call, so no manual refresh logic is
 * needed here.
 *
 * A new client is constructed per call rather than cached, to avoid shared
 * mutable state across concurrent requests in Vercel Fluid Compute.
 */
function getOAuth2Client() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });
  return client;
}

/**
 * Returns an authenticated Calendar v3 client. Operations target the
 * user's primary calendar (which is remi@ambitionangels.org under this
 * auth model) or the calendar specified by GOOGLE_CALENDAR_ID.
 */
export function getCalendarClient(): calendar_v3.Calendar {
  return google.calendar({ version: "v3", auth: getOAuth2Client() });
}

/**
 * Returns an authenticated Gmail v1 client. Send operations against
 * users.messages.send with userId 'me' send from the authenticated user,
 * which is remi@ambitionangels.org. No "from" header manipulation needed —
 * the from address is implicitly the authenticated user.
 */
export function getGmailClient(): gmail_v1.Gmail {
  return google.gmail({ version: "v1", auth: getOAuth2Client() });
}
