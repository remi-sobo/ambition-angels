import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";

/**
 * Supabase Auth redirect target: exchanges the one-time code from magic
 * links (and future OAuth/recovery flows) for a session, then forwards to
 * the app. Configure this URL in Supabase → Auth → URL Configuration.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const next = req.nextUrl.searchParams.get("next") ?? "/admin";
  // Only allow same-origin relative redirects.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/admin";

  if (code) {
    const supabase = createServerSupabase();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Same ledger as password sign-ins (/api/admin/login). Method comes
      // from the auth provider: "google" for OAuth, "email" for magic links.
      await audit(req, {
        action: "auth.login",
        entityType: "auth",
        actorUserId: data.user?.id ?? null,
        after: {
          email: data.user?.email ?? null,
          method: (data.user?.app_metadata?.provider as string | undefined) ?? "otp",
        },
      });
      return NextResponse.redirect(new URL(safeNext, req.nextUrl.origin));
    }
    console.error("Auth callback error:", error.message);
  }
  return NextResponse.redirect(new URL("/admin?auth_error=1", req.nextUrl.origin));
}
