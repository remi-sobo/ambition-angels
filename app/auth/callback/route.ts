import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

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
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(safeNext, req.nextUrl.origin));
    }
    console.error("Auth callback error:", error.message);
  }
  return NextResponse.redirect(new URL("/admin?auth_error=1", req.nextUrl.origin));
}
