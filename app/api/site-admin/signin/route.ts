import { NextRequest, NextResponse } from "next/server";
import { createSiteAuthClient, isSiteAdminEmail } from "@/lib/site/adminAuth";
import { getSiteSupabase } from "@/lib/site/supabase";
import { marketingOrigin } from "@/lib/origins";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

// POST /api/site-admin/signin — email a magic link, only to an address on
// SITE_ADMIN_EMAILS. Same response either way, so the form never reveals
// who has access.
const GENERIC = { ok: true };

export async function POST(req: NextRequest) {
  const rl = rateLimit(`site-admin-signin:${getClientIp(req)}`, { limit: 6, windowMs: 15 * 60 * 1000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!isSiteAdminEmail(email)) return NextResponse.json(GENERIC);

  // A sign-in never creates a user (the same rule BloomOS follows). An
  // address on SITE_ADMIN_EMAILS gets its account made here, explicitly and
  // only after the allowlist check; "already exists" is the normal case.
  const { error: createErr } = await getSiteSupabase().auth.admin.createUser({ email, email_confirm: true });
  if (createErr && !/already|registered|exists/i.test(createErr.message)) {
    console.error("[site-admin] could not provision admin account:", createErr.message);
  }

  const { error } = await createSiteAuthClient().auth.signInWithOtp({
    email,
    // The configured public origin, never the request's (a Vercel deployment
    // URL would miss Supabase's redirect allowlist).
    options: { emailRedirectTo: `${marketingOrigin()}/admin/auth/callback`, shouldCreateUser: false },
  });
  if (error) console.error("[site-admin] magic link failed:", error.message);
  return NextResponse.json(GENERIC);
}
