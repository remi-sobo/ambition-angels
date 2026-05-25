import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ygb_registrations")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("YGB admin registrations error:", error);
    return NextResponse.json({ error: "Failed to load registrations" }, { status: 500 });
  }

  return NextResponse.json({ registrations: data ?? [] });
}
