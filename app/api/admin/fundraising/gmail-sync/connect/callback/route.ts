/**
 * Google's redirect back from connecting the synced mailbox through the
 * Internal OAuth client. Verifies the CSRF state, exchanges the code, insists
 * on gmail.readonly and a refresh token, reads the mailbox address from the
 * Gmail profile, requires it to be in the Workspace domain, and stores the
 * encrypted refresh token (lib/google/gmail-sync-connection.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { getOrgContext, ctxHasPermission } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { isEnvIntegrationOwner } from "@/lib/integrations/env-owner";
import {
  GMAIL_SYNC_CONNECT_PATH,
  GMAIL_SYNC_PAGE_PATH,
  GMAIL_SYNC_STATE_COOKIE,
  gmailSyncOAuthClient,
  gmailSyncRedirectUri,
  gmailSyncWorkspaceDomain,
  hasGmailReadScope,
} from "@/lib/google/gmail-sync-oauth";
import { upsertGmailSyncConnection } from "@/lib/google/gmail-sync-connection";

export const dynamic = "force-dynamic";

function back(origin: string, params: Record<string, string>) {
  const url = new URL(GMAIL_SYNC_PAGE_PATH, origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = NextResponse.redirect(url);
  res.cookies.set(GMAIL_SYNC_STATE_COOKIE, "", { path: GMAIL_SYNC_CONNECT_PATH, maxAge: 0 });
  return res;
}

/** Only the error code and message, never tokens or request bodies. */
function errorSummary(err: unknown): string {
  const e = err as { response?: { data?: { error?: unknown } }; message?: unknown };
  const code = e?.response?.data?.error;
  return [typeof code === "string" ? code : null, typeof e?.message === "string" ? e.message : null]
    .filter(Boolean)
    .join(": ")
    .slice(0, 200);
}

export async function GET(req: NextRequest) {
  const ctx = await getOrgContext();
  const origin = req.nextUrl.origin;
  if (!ctx) return NextResponse.redirect(new URL("/admin", origin));
  const fail = (reason: string) => back(origin, { gmail_sync: "error", reason });

  if (req.nextUrl.searchParams.get("error")) return back(origin, { gmail_sync: "cancelled" });

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expected = req.cookies.get(GMAIL_SYNC_STATE_COOKIE)?.value;
  if (!code || !state || !expected || state !== expected) {
    return fail("The sign-in attempt expired or didn't match. Try connecting again.");
  }
  // Re-check: the active org could have changed between start and callback.
  if (!(await ctxHasPermission(ctx, "org.manage"))) {
    return fail("Only an org admin can connect the synced mailbox.");
  }
  if (!(await isEnvIntegrationOwner("gmail_sync", ctx.orgId))) {
    return fail("Gmail sync isn't available for this organization.");
  }

  let accountEmail: string;
  let refreshToken: string;
  let scope: string;
  try {
    const client = gmailSyncOAuthClient(gmailSyncRedirectUri(origin));
    const { tokens } = await client.getToken(code);
    if (!hasGmailReadScope(tokens.scope)) {
      return fail("Google didn't grant read access to the mailbox. Connect again and leave the box ticked.");
    }
    if (!tokens.refresh_token) {
      return fail("Google didn't return a long-lived permission. Try connecting again.");
    }
    client.setCredentials(tokens);
    const profile = await google.gmail({ version: "v1", auth: client }).users.getProfile({ userId: "me" });
    const email = (profile.data.emailAddress ?? "").toLowerCase();
    if (!email.endsWith(`@${gmailSyncWorkspaceDomain()}`)) {
      return fail(`Connect a mailbox in ${gmailSyncWorkspaceDomain()}.`);
    }
    accountEmail = email;
    refreshToken = tokens.refresh_token;
    scope = tokens.scope ?? "";
  } catch (err) {
    console.error("connect gmail sync callback failed:", errorSummary(err));
    return fail("Couldn't finish connecting the mailbox. Try again.");
  }

  try {
    await upsertGmailSyncConnection({
      orgId: ctx.orgId,
      userId: ctx.userId,
      connectedByEmail: ctx.email,
      accountEmail,
      refreshToken,
      scope,
    });
  } catch (err) {
    console.error("storing gmail sync connection failed:", err instanceof Error ? err.message : "unknown");
    return fail("Couldn't save the connection. Try again.");
  }
  await audit(req, {
    action: "fundraising.gmail_sync.connect",
    entityType: "connection",
    entityId: null,
    after: { provider: "google_gmail_read", account_email: accountEmail, oauth_client: "internal" },
  });

  return back(origin, { gmail_sync: "connected" });
}
