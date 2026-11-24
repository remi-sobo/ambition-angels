import { NextRequest, NextResponse } from "next/server";
import { createSiteAuthClient, isSiteAdminEmail } from "@/lib/site/adminAuth";

// GET /admin/auth/callback on ambitionangels.org (rewritten here): finish the
// magic-link sign-in, then land on the website admin home. Someone who is no
// longer on SITE_ADMIN_EMAILS is signed straight back out.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const home = new URL("/admin", req.url);
  if (!code) return NextResponse.redirect(home);
  const supabase = createSiteAuthClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !isSiteAdminEmail(data.user?.email)) {
    await supabase.auth.signOut().catch(() => undefined);
  }
  return NextResponse.redirect(home);
}
