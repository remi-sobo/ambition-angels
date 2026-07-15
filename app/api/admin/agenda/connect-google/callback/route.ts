/**
 * Google OAuth callback for the calendar connect flow. Verifies the CSRF
 * state, exchanges the auth code for a refresh token, stages the token as a
 * per-user `pending` connection (encrypted, invisible to sync), and returns
 * the user to Settings where they pick which of the account's calendars to
 * connect (?calendar=pick).
 */
import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/admin/auth";
import { oauthClient, listAccountCalendars, OAUTH_STATE_COOKIE } from "@/lib/google/oauth";
import { upsertPendingGoogleAccount } from "@/lib/google/connection";

export const dynamic = "force-dynamic";

function settingsRedirect(origin: string, params: Record<string, string>) {
  const url = new URL("/admin/settings", origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = NextResponse.redirect(url);
  res.cookies.set(OAUTH_STATE_COOKIE, "", { path: "/api/admin/agenda/connect-google", maxAge: 0 });
  return res;
}

export async function GET(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.redirect(new URL("/admin", req.nextUrl.origin));
  const origin = req.nextUrl.origin;

  // User hit "cancel" on Google's screen (or Google returned an error).
  const oauthError = req.nextUrl.searchParams.get("error");
  if (oauthError) {
    return settingsRedirect(origin, { calendar: "cancelled" });
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expectedState = req.cookies.get(OAUTH_STATE_COOKIE)?.value;
  if (!code || !state || !expectedState || state !== expectedState) {
    return settingsRedirect(origin, {
      calendar: "error",
      reason: "The sign-in attempt expired or didn't match — try connecting again.",
    });
  }

  try {
    const { tokens } = await oauthClient(origin).getToken(code);
    const refreshToken = tokens.refresh_token;
    if (!refreshToken) {
      return settingsRedirect(origin, {
        calendar: "error",
        reason: "Google didn't return a refresh token — try connecting again.",
      });
    }

    // The account's primary calendar id is its email — identifies the account
    // for display without any extra scope.
    const calendars = await listAccountCalendars(refreshToken);
    const accountEmail = calendars.find((c) => c.primary)?.id ?? "";

    await upsertPendingGoogleAccount({
      orgId: ctx.orgId,
      userId: ctx.userId,
      refreshToken,
      accountEmail,
    });
  } catch (err) {
    console.error("connect-google callback failed:", err instanceof Error ? err.message : err);
    return settingsRedirect(origin, {
      calendar: "error",
      reason: "Couldn't complete the Google connection — try again.",
    });
  }

  return settingsRedirect(origin, { calendar: "pick" });
}
