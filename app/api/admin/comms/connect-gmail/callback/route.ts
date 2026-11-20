/**
 * Google's redirect back from Connect Gmail. Verifies the CSRF state,
 * exchanges the code, insists the grant includes gmail.send, reads which
 * account was chosen from the verified id_token, stores the encrypted
 * refresh token as the org's sender, and switches the org to the Gmail
 * transport.
 */
import { NextRequest, NextResponse } from "next/server";
import { getOrgContext, ctxHasPermission } from "@/lib/admin/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { INVALID_CLIENT_REASON } from "@/lib/google/oauth";
import {
  COMMS_PAGE_PATH,
  GMAIL_CONNECT_PATH,
  GMAIL_STATE_COOKIE,
  gmailOAuthClient,
  grantIncludesGmailSend,
} from "@/lib/comms/gmail-oauth";
import { upsertGmailConnection } from "@/lib/comms/gmail-connection";
import { GMAIL_DEFAULT_DAILY_CAP, GMAIL_MAX_DAILY_CAP } from "@/lib/comms/settings";

export const dynamic = "force-dynamic";

function back(origin: string, params: Record<string, string>) {
  const url = new URL(COMMS_PAGE_PATH, origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = NextResponse.redirect(url);
  res.cookies.set(GMAIL_STATE_COOKIE, "", { path: GMAIL_CONNECT_PATH, maxAge: 0 });
  return res;
}

export async function GET(req: NextRequest) {
  const ctx = await getOrgContext();
  const origin = req.nextUrl.origin;
  if (!ctx) return NextResponse.redirect(new URL("/admin", origin));
  const fail = (reason: string) => back(origin, { gmail: "error", reason });

  if (req.nextUrl.searchParams.get("error")) return back(origin, { gmail: "cancelled" });

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expected = req.cookies.get(GMAIL_STATE_COOKIE)?.value;
  if (!code || !state || !expected || state !== expected) {
    return fail("The sign-in attempt expired or didn't match. Try connecting again.");
  }
  // Re-check: the active org could have changed between start and callback.
  if (!(await ctxHasPermission(ctx, "org.manage"))) {
    return fail("Only an org admin can connect the Gmail account campaigns send from.");
  }

  let accountEmail: string;
  let refreshToken: string;
  let scope: string;
  try {
    const client = gmailOAuthClient(origin);
    const { tokens } = await client.getToken(code);
    if (!grantIncludesGmailSend(tokens.scope)) {
      return fail("Google didn't give permission to send email. Connect again and leave \"Send email on your behalf\" ticked.");
    }
    if (!tokens.refresh_token) {
      return fail("Google didn't return a long-lived permission. Try connecting again.");
    }
    if (!tokens.id_token) {
      return fail("Google didn't say which account was chosen. Try connecting again.");
    }
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: (process.env.GOOGLE_CLIENT_ID || "").trim(),
    });
    const payload = ticket.getPayload();
    if (!payload?.email || payload.email_verified === false) {
      return fail("Google didn't confirm that account's email address. Try a different account.");
    }
    accountEmail = payload.email.toLowerCase();
    refreshToken = tokens.refresh_token;
    scope = tokens.scope ?? "";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("connect-gmail callback failed:", msg);
    return fail(/invalid_client/i.test(msg) ? INVALID_CLIENT_REASON : "Couldn't finish connecting Gmail. Try again.");
  }

  try {
    await upsertGmailConnection({
      orgId: ctx.orgId,
      userId: ctx.userId,
      connectedByEmail: ctx.email,
      accountEmail,
      refreshToken,
      scope,
    });
    await switchOrgToGmail(ctx.orgId, ctx.orgName);
  } catch (err) {
    console.error("storing gmail connection failed:", err instanceof Error ? err.message : err);
    return fail("Couldn't save the Gmail connection. Try again.");
  }

  await audit(req, {
    action: "fundraising.comms_gmail.connect",
    entityType: "connection",
    entityId: null,
    after: { provider: "google_gmail", account_email: accountEmail },
  });
  return back(origin, { gmail: "connected" });
}

/**
 * Point the org's comms settings at Gmail, creating the settings row for an
 * org that never had one (only Ambition Angels was seeded). Service role:
 * the caller's org.manage was checked above, and a brand-new org has no row
 * for the RLS write policy to match.
 *
 * Caps: a new row starts at the Gmail default; an existing cap above Gmail's
 * safe maximum comes down to the default, since Resend-era caps (2,000) would
 * get the account locked by Google.
 */
async function switchOrgToGmail(orgId: string, orgName: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const { data: existing, error: readErr } = await admin
    .from("org_comms_settings")
    .select("daily_send_cap")
    .eq("org_id", orgId)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);

  if (!existing) {
    const { error } = await admin.from("org_comms_settings").insert({
      org_id: orgId,
      from_name: orgName,
      transport: "gmail",
      daily_send_cap: GMAIL_DEFAULT_DAILY_CAP,
    });
    if (error) throw new Error(error.message);
    return;
  }

  const cap = existing.daily_send_cap as number;
  const { error } = await admin
    .from("org_comms_settings")
    .update({
      transport: "gmail",
      ...(cap > GMAIL_MAX_DAILY_CAP ? { daily_send_cap: GMAIL_DEFAULT_DAILY_CAP } : {}),
    })
    .eq("org_id", orgId);
  if (error) throw new Error(error.message);
}
