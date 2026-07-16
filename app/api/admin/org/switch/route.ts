import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";
import { ACTIVE_ORG_COOKIE } from "@/lib/admin/auth";

/**
 * POST /api/admin/org/switch — set the active-org cookie (core fence spec
 * §6c, C1). The ONLY writer of bloom_active_org: the org must be one the
 * session user holds a membership in, checked on the session client so RLS
 * is the proof. getOrgContext() ignores values that stop validating (e.g.
 * a membership revoked after the cookie was set), so a stale cookie can
 * never scope anyone into an org they don't belong to.
 */
export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { org_id?: string } | null;
  const orgId = typeof body?.org_id === "string" ? body.org_id : "";
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) {
    return NextResponse.json({ error: "org_id is required" }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: "Not a member of that organization" }, { status: 403 });
  }

  cookies().set(ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return NextResponse.json({ ok: true });
}
