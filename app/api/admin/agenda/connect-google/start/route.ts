/**
 * Begin the Google Calendar connect flow: send the signed-in user to Google's
 * OAuth consent screen with the account chooser forced (prompt=select_account),
 * so they pick which Google account to connect — nothing is hardcoded or
 * pre-selected. Google redirects back to ../callback with an auth code.
 *
 * Any authed org member may connect their own calendar.
 */
import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/admin/auth";
import { isTokenEncConfigured } from "@/lib/crypto/secret-box";
import { buildConsentUrl, OAUTH_STATE_COOKIE, preflightOAuthCredentials } from "@/lib/google/oauth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.redirect(new URL("/admin", req.nextUrl.origin));

  const settingsUrl = new URL("/admin/settings", req.nextUrl.origin);
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    settingsUrl.searchParams.set("calendar", "error");
    settingsUrl.searchParams.set("reason", "Google OAuth is not configured on the server.");
    return NextResponse.redirect(settingsUrl);
  }
  if (!isTokenEncConfigured()) {
    settingsUrl.searchParams.set("calendar", "error");
    settingsUrl.searchParams.set("reason", "BLOOMOS_TOKEN_ENC_KEY is not set on the server.");
    return NextResponse.redirect(settingsUrl);
  }

  // Preflight the OAuth client id/secret against Google before sending the user
  // to consent — otherwise a wrong GOOGLE_CLIENT_SECRET only surfaces at the
  // callback's token exchange, after the whole consent round-trip.
  const preflight = await preflightOAuthCredentials();
  if (!preflight.ok) {
    settingsUrl.searchParams.set("calendar", "error");
    settingsUrl.searchParams.set("reason", preflight.reason);
    return NextResponse.redirect(settingsUrl);
  }

  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(buildConsentUrl(req.nextUrl.origin, state));
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax", // must survive the top-level redirect back from Google
    secure: process.env.NODE_ENV === "production",
    path: "/api/admin/agenda/connect-google",
    maxAge: 600,
  });
  return res;
}
