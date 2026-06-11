import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";

/**
 * BloomOS sign-in, backed by Supabase Auth.
 *
 * Two modes:
 *  - { email, password }       → password sign-in; session cookies set here.
 *  - { email, magic: true }    → emails a one-time sign-in link that lands
 *                                on /auth/callback.
 *
 * Users are provisioned in the Supabase dashboard (Auth → Add user) or via
 * magic-link self-signup; org membership is granted automatically by the
 * on_auth_user_created trigger for allowlisted emails/domains. A session
 * without a membership is treated as unauthenticated by lib/admin/auth.ts.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = body && typeof body.email === "string" ? body.email.trim() : "";
  const password = body && typeof body.password === "string" ? body.password : "";
  const magic = body && body.magic === true;

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const supabase = createServerSupabase();

  if (magic) {
    const origin = req.nextUrl.origin;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${origin}/auth/callback?next=/admin` },
    });
    if (error) {
      console.error("Magic link error:", error.message);
      return NextResponse.json({ error: "Could not send sign-in link" }, { status: 500 });
    }
    await audit(req, {
      action: "auth.magic_link_sent",
      entityType: "auth",
      actorUserId: null,
      after: { email },
    });
    return NextResponse.json({ ok: true, sent: true });
  }

  if (!password) {
    return NextResponse.json({ error: "Password is required" }, { status: 400 });
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    await audit(req, {
      action: "auth.login_failed",
      entityType: "auth",
      actorUserId: null,
      after: { email },
    });
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }
  // Request cookies predate this sign-in, so attribute explicitly.
  await audit(req, {
    action: "auth.login",
    entityType: "auth",
    actorUserId: data.user?.id ?? null,
    after: { email, method: "password" },
  });
  return NextResponse.json({ ok: true });
}
