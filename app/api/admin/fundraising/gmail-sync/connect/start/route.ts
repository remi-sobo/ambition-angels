/**
 * Begin connecting the mailbox the Gmail read sync reads, through the separate
 * Internal OAuth client (lib/google/gmail-sync-oauth.ts). Sends an org admin
 * to Google's consent screen, account chooser forced, pinned to the Workspace
 * domain, asking only for gmail.readonly. Google redirects back to ../callback.
 *
 * Only org.manage in the env-owner org may connect. Connecting works while the
 * sync is paused, so the mailbox can be ready before GMAIL_SYNC_PAUSED flips.
 */
import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getOrgContext, ctxHasPermission } from "@/lib/admin/auth";
import { isTokenEncConfigured } from "@/lib/crypto/secret-box";
import { isEnvIntegrationOwner } from "@/lib/integrations/env-owner";
import {
  buildGmailSyncConsentUrl,
  GMAIL_SYNC_CONNECT_PATH,
  GMAIL_SYNC_PAGE_PATH,
  GMAIL_SYNC_STATE_COOKIE,
  isGmailSyncClientConfigured,
} from "@/lib/google/gmail-sync-oauth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.redirect(new URL("/admin", req.nextUrl.origin));

  const back = (reason: string) => {
    const url = new URL(GMAIL_SYNC_PAGE_PATH, req.nextUrl.origin);
    url.searchParams.set("gmail_sync", "error");
    url.searchParams.set("reason", reason);
    return NextResponse.redirect(url);
  };

  if (!(await ctxHasPermission(ctx, "org.manage"))) {
    return back("Only an org admin can connect the synced mailbox.");
  }
  if (!(await isEnvIntegrationOwner("gmail_sync", ctx.orgId))) {
    return back("Gmail sync isn't available for this organization.");
  }
  if (!isGmailSyncClientConfigured()) {
    return back("The internal Gmail app isn't set up on the server (GMAIL_SYNC_CLIENT_ID / GMAIL_SYNC_CLIENT_SECRET).");
  }
  if (!isTokenEncConfigured()) {
    return back("BLOOMOS_TOKEN_ENC_KEY is not set on the server.");
  }

  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(buildGmailSyncConsentUrl(req.nextUrl.origin, state));
  res.cookies.set(GMAIL_SYNC_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax", // must survive the top-level redirect back from Google
    secure: process.env.NODE_ENV === "production",
    path: GMAIL_SYNC_CONNECT_PATH,
    maxAge: 600,
  });
  return res;
}
