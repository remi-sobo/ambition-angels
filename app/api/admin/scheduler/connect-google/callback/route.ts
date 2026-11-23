/**
 * Google's redirect back from connecting the scheduler Google account.
 * Verifies the CSRF state, exchanges the code, insists the grant includes
 * both calendar and gmail.send, reads which account was chosen from its
 * primary calendar id (no extra scope), and stores the encrypted refresh
 * token as the org's scheduler account.
 */
import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { getOrgContext, ctxHasPermission } from "@/lib/admin/auth";
import { getResidentOrgId } from "@/lib/admin/orgs";
import { audit } from "@/lib/audit";
import { INVALID_CLIENT_REASON } from "@/lib/google/oauth";
import { googleErrorSummary } from "@/lib/google/log-safe";
import {
  missingSchedulerScopes,
  SCHEDULER_CONNECT_PATH,
  SCHEDULER_PAGE_PATH,
  SCHEDULER_STATE_COOKIE,
  schedulerOAuthClient,
} from "@/lib/google/scheduler-oauth";
import { upsertSchedulerConnection } from "@/lib/google/scheduler-connection";

export const dynamic = "force-dynamic";

function back(origin: string, params: Record<string, string>) {
  const url = new URL(SCHEDULER_PAGE_PATH, origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = NextResponse.redirect(url);
  res.cookies.set(SCHEDULER_STATE_COOKIE, "", { path: SCHEDULER_CONNECT_PATH, maxAge: 0 });
  return res;
}

export async function GET(req: NextRequest) {
  const ctx = await getOrgContext();
  const origin = req.nextUrl.origin;
  if (!ctx) return NextResponse.redirect(new URL("/admin", origin));
  const fail = (reason: string) => back(origin, { scheduler: "error", reason });

  if (req.nextUrl.searchParams.get("error")) return back(origin, { scheduler: "cancelled" });

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expected = req.cookies.get(SCHEDULER_STATE_COOKIE)?.value;
  if (!code || !state || !expected || state !== expected) {
    return fail("The sign-in attempt expired or didn't match. Try connecting again.");
  }
  // Re-check: the active org could have changed between start and callback.
  if (!(await ctxHasPermission(ctx, "org.manage"))) {
    return fail("Only an org admin can connect the scheduler Google account.");
  }
  if (ctx.orgId !== (await getResidentOrgId())) {
    return fail("The meeting scheduler isn't available for this organization yet.");
  }

  let accountEmail: string;
  let refreshToken: string;
  let scope: string;
  try {
    const client = schedulerOAuthClient(origin);
    const { tokens } = await client.getToken(code);
    if (missingSchedulerScopes(tokens.scope).length) {
      return fail(
        "Google didn't give every permission the scheduler needs. Connect again and leave both boxes ticked (calendar, and send email on your behalf)."
      );
    }
    if (!tokens.refresh_token) {
      return fail("Google didn't return a long-lived permission. Try connecting again.");
    }
    // The primary calendar's id is the account's email.
    client.setCredentials(tokens);
    const primary = await google.calendar({ version: "v3", auth: client }).calendars.get({ calendarId: "primary" });
    const id = (primary.data.id ?? "").toLowerCase();
    if (!id.includes("@")) {
      return fail("Google didn't say which account was chosen. Try connecting again.");
    }
    accountEmail = id;
    refreshToken = tokens.refresh_token;
    scope = tokens.scope ?? "";
  } catch (err) {
    const msg = googleErrorSummary(err);
    console.error("connect scheduler google callback failed:", msg);
    return fail(/invalid_client/i.test(msg) ? INVALID_CLIENT_REASON : "Couldn't finish connecting Google. Try again.");
  }

  try {
    await upsertSchedulerConnection({
      orgId: ctx.orgId,
      userId: ctx.userId,
      connectedByEmail: ctx.email,
      accountEmail,
      refreshToken,
      scope,
    });
  } catch (err) {
    console.error("storing scheduler connection failed:", err instanceof Error ? err.message : String(err));
    return fail("Couldn't save the scheduler connection. Try again.");
  }

  await audit(req, {
    action: "org.scheduler_google.connect",
    entityType: "connection",
    entityId: null,
    after: { provider: "google_scheduler", account_email: accountEmail },
  });
  return back(origin, { scheduler: "connected" });
}
