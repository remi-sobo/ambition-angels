import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";

// Revoke every session for the signed-in admin (global sign-out) — useful after
// a password change or a lost device. Clears this device's cookies too.
export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await supabase.auth.signOut({ scope: "global" });
  await audit(req, {
    action: "auth.signout_all",
    entityType: "auth",
    actorUserId: user.id,
  });
  const res = NextResponse.json({ ok: true });
  res.cookies.set("admin_auth", "", { maxAge: 0, path: "/" });
  res.cookies.set("admin_user", "", { maxAge: 0, path: "/" });
  return res;
}
