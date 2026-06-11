import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function POST() {
  const supabase = createServerSupabase();
  await supabase.auth.signOut();

  const res = NextResponse.json({ ok: true });
  // Clear legacy password-era cookies too, so old sessions can't linger.
  res.cookies.set("admin_auth", "", { maxAge: 0, path: "/" });
  res.cookies.set("admin_user", "", { maxAge: 0, path: "/" });
  return res;
}
