/**
 * Intuit OAuth callback. Verifies the CSRF state, exchanges the code for
 * tokens, stores them encrypted on the org's `quickbooks` connection, runs the
 * first pull (register + cash), and returns to Finance → Transactions.
 */
import { NextRequest, NextResponse } from "next/server";
import { ctxHasPermission, getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { exchangeQboCode, QBO_OAUTH_STATE_COOKIE } from "@/lib/quickbooks/client";
import { saveQuickBooksConnection, syncQuickBooks } from "@/lib/quickbooks/connection";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function back(origin: string, params: Record<string, string>) {
  const url = new URL("/admin/finance/transactions", origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = NextResponse.redirect(url);
  res.cookies.set(QBO_OAUTH_STATE_COOKIE, "", { path: "/api/admin/finance/quickbooks", maxAge: 0 });
  return res;
}

export async function GET(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.redirect(new URL("/admin", req.nextUrl.origin));
  const origin = req.nextUrl.origin;
  const sp = req.nextUrl.searchParams;

  if (sp.get("error")) return back(origin, { qbo: "cancelled" });

  const code = sp.get("code");
  const realmId = sp.get("realmId");
  const state = sp.get("state");
  const expected = req.cookies.get(QBO_OAUTH_STATE_COOKIE)?.value;
  if (!code || !realmId || !state || !expected || state !== expected) {
    return back(origin, { qbo: "error", reason: "The sign-in attempt expired or didn't match. Try connecting again." });
  }
  if (!(await ctxHasPermission(ctx, "finance.write"))) {
    return back(origin, { qbo: "error", reason: "Connecting QuickBooks needs finance edit access." });
  }

  try {
    const tokens = await exchangeQboCode(code, origin);
    await saveQuickBooksConnection({ orgId: ctx.orgId, realmId, tokens, connectedBy: ctx.userId });
  } catch (err) {
    console.error("quickbooks callback failed:", err instanceof Error ? err.message : err);
    return back(origin, { qbo: "error", reason: "Couldn't complete the QuickBooks connection. Try again." });
  }

  await audit(req, { action: "finance.quickbooks.connect", entityType: "connections", after: { realm_id: realmId } });

  const first = await syncQuickBooks(ctx.orgId);
  return first.ok
    ? back(origin, { qbo: "connected" })
    : back(origin, { qbo: "error", reason: `Connected, but the first pull failed: ${first.error}` });
}
