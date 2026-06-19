import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

/**
 * Change the signed-in admin's password (BloomOS account settings).
 *
 * The current password must be supplied and is verified before the change —
 * Supabase's updateUser() alone wouldn't require it. We verify by attempting a
 * sign-in on a throwaway client (persistSession:false, no cookies) so the
 * caller's real session is never touched, then update via the session client.
 */
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

  if (!currentPassword) {
    return NextResponse.json({ error: "Enter your current password" }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
  }
  if (newPassword === currentPassword) {
    return NextResponse.json({ error: "New password must be different from the current one" }, { status: 400 });
  }
  if (!ctx.email) {
    return NextResponse.json({ error: "No email on this account" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 500 });
  }

  // Verify the current password without disturbing the live session.
  const verifier = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: verifyErr } = await verifier.auth.signInWithPassword({
    email: ctx.email,
    password: currentPassword,
  });
  if (verifyErr) {
    await audit(req, {
      action: "auth.password_change_failed",
      entityType: "auth",
      entityId: null,
      after: { reason: "bad_current_password" },
    });
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }
  await verifier.auth.signOut().catch(() => {});

  // Apply the change on the cookie-backed session client.
  const supabase = createServerSupabase();
  const { error: updErr } = await supabase.auth.updateUser({ password: newPassword });
  if (updErr) {
    console.error("Password update failed:", updErr.message);
    return NextResponse.json({ error: "Couldn't update the password" }, { status: 500 });
  }

  await audit(req, {
    action: "auth.password_change",
    entityType: "auth",
    entityId: null,
  });
  return NextResponse.json({ ok: true });
}
