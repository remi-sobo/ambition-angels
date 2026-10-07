/**
 * Begin the QuickBooks Online connect flow: send a finance writer to Intuit's
 * consent screen, where they pick the company and authorize. Intuit redirects
 * back to ../callback with a code and the company's realmId.
 *
 * BloomOS only ever reads two things from the company (lib/quickbooks/client.ts).
 */
import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { ctxHasPermission, getOrgContext } from "@/lib/admin/auth";
import { isTokenEncConfigured } from "@/lib/crypto/secret-box";
import { buildQboConsentUrl, isQboConfigured, QBO_OAUTH_STATE_COOKIE } from "@/lib/quickbooks/client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.redirect(new URL("/admin", req.nextUrl.origin));

  const back = new URL("/admin/finance/transactions", req.nextUrl.origin);
  const fail = (reason: string) => {
    back.searchParams.set("qbo", "error");
    back.searchParams.set("reason", reason);
    return NextResponse.redirect(back);
  };
  if (!(await ctxHasPermission(ctx, "finance.write"))) {
    return fail("Connecting QuickBooks needs finance edit access.");
  }
  if (!isQboConfigured()) return fail("QuickBooks is not configured on the server (QBO_CLIENT_ID / QBO_CLIENT_SECRET).");
  if (!isTokenEncConfigured()) return fail("BLOOMOS_TOKEN_ENC_KEY is not set on the server.");

  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(buildQboConsentUrl(req.nextUrl.origin, state));
  res.cookies.set(QBO_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax", // must survive the top-level redirect back from Intuit
    secure: process.env.NODE_ENV === "production",
    path: "/api/admin/finance/quickbooks",
    maxAge: 600,
  });
  return res;
}
