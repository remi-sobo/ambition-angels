/**
 * Begin Connect Gmail (Comms settings): send an org manager to Google's
 * consent screen with the account chooser forced, asking only to send mail.
 * Google redirects back to ../callback with an auth code.
 *
 * Only org.manage may connect: the connected account is who every campaign
 * from this org comes from.
 */
import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getOrgContext, ctxHasPermission } from "@/lib/admin/auth";
import { isTokenEncConfigured } from "@/lib/crypto/secret-box";
import { preflightOAuthCredentials } from "@/lib/google/oauth";
import {
  buildGmailConsentUrl,
  COMMS_PAGE_PATH,
  GMAIL_CONNECT_PATH,
  GMAIL_STATE_COOKIE,
} from "@/lib/comms/gmail-oauth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.redirect(new URL("/admin", req.nextUrl.origin));

  const back = (reason: string) => {
    const url = new URL(COMMS_PAGE_PATH, req.nextUrl.origin);
    url.searchParams.set("gmail", "error");
    url.searchParams.set("reason", reason);
    return NextResponse.redirect(url);
  };

  if (!(await ctxHasPermission(ctx, "org.manage"))) {
    return back("Only an org admin can connect the Gmail account campaigns send from.");
  }
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return back("Google sign-in is not configured on the server.");
  }
  if (!isTokenEncConfigured()) {
    return back("BLOOMOS_TOKEN_ENC_KEY is not set on the server.");
  }
  const preflight = await preflightOAuthCredentials();
  if (!preflight.ok) return back(preflight.reason);

  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(buildGmailConsentUrl(req.nextUrl.origin, state));
  res.cookies.set(GMAIL_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax", // must survive the top-level redirect back from Google
    secure: process.env.NODE_ENV === "production",
    path: GMAIL_CONNECT_PATH,
    maxAge: 600,
  });
  return res;
}
