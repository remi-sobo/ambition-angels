import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

/**
 * Email a Supabase password-recovery link, so a user can set a NEW password
 * WITHOUT knowing the current one. This is the escape hatch the Settings
 * change-password form can't offer (it verifies the current password by
 * design), and the path for anyone provisioned via magic link / invite who
 * never had a password to begin with.
 *
 * Surfaced from the login screen ("Forgot password?") and Settings ("don't
 * know your current password?"). A signed-in caller can only reset their OWN
 * account — ctx.email wins over any posted address. Supabase returns success
 * whether or not the address has an account, so this never reveals which
 * emails exist. The link lands on /auth/callback (mirrors the magic-link
 * flow), which establishes a session and forwards to /admin/reset-password to
 * pick the new password.
 */
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const bodyEmail = typeof body?.email === "string" ? body.email.trim() : "";
  const email = ctx?.email || bodyEmail;
  if (!email) {
    return NextResponse.json({ error: "Enter your email" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const origin = req.nextUrl.origin;
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/admin/reset-password`,
  });
  if (error) {
    console.error("Password reset email failed:", error.message);
    return NextResponse.json(
      { error: "Couldn't send the reset link — try again." },
      { status: 500 }
    );
  }

  await audit(req, {
    action: "auth.password_reset_sent",
    entityType: "auth",
    actorUserId: ctx?.userId ?? null,
    after: { email },
  });
  return NextResponse.json({ ok: true, sent: true });
}
