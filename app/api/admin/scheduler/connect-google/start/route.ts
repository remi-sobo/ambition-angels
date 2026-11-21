/**
 * Begin connecting the scheduler Google account (Settings → Connections):
 * send an org admin to Google's consent screen with the account chooser
 * forced, asking only for calendar + gmail.send. Google redirects back to
 * ../callback with an auth code.
 *
 * Only org.manage in the resident org may connect: the /meet scheduler books
 * only for the resident org (lib/meet/host.ts), so a token stored for any
 * other org would never be used.
 */
import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getOrgContext, ctxHasPermission } from "@/lib/admin/auth";
import { getResidentOrgId } from "@/lib/admin/orgs";
import { isTokenEncConfigured } from "@/lib/crypto/secret-box";
import { preflightOAuthCredentials } from "@/lib/google/oauth";
import {
  buildSchedulerConsentUrl,
  SCHEDULER_CONNECT_PATH,
  SCHEDULER_PAGE_PATH,
  SCHEDULER_STATE_COOKIE,
} from "@/lib/google/scheduler-oauth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.redirect(new URL("/admin", req.nextUrl.origin));

  const back = (reason: string) => {
    const url = new URL(SCHEDULER_PAGE_PATH, req.nextUrl.origin);
    url.searchParams.set("scheduler", "error");
    url.searchParams.set("reason", reason);
    return NextResponse.redirect(url);
  };

  if (!(await ctxHasPermission(ctx, "org.manage"))) {
    return back("Only an org admin can connect the scheduler Google account.");
  }
  if (ctx.orgId !== (await getResidentOrgId())) {
    return back("The meeting scheduler isn't available for this organization yet.");
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
  const res = NextResponse.redirect(buildSchedulerConsentUrl(req.nextUrl.origin, state));
  res.cookies.set(SCHEDULER_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax", // must survive the top-level redirect back from Google
    secure: process.env.NODE_ENV === "production",
    path: SCHEDULER_CONNECT_PATH,
    maxAge: 600,
  });
  return res;
}
