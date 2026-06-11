import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  // Capture the actor before the session is destroyed.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await supabase.auth.signOut();
  await audit(req, {
    action: "auth.logout",
    entityType: "auth",
    actorUserId: user?.id ?? null,
  });

  const res = NextResponse.json({ ok: true });
  // Clear legacy password-era cookies too, so old sessions can't linger.
  res.cookies.set("admin_auth", "", { maxAge: 0, path: "/" });
  res.cookies.set("admin_user", "", { maxAge: 0, path: "/" });
  return res;
}
