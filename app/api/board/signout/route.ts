import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

/** Ends the Supabase session and clears its cookies. */
export async function POST() {
  const supabase = createServerSupabase();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
