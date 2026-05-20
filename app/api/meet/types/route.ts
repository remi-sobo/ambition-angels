import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// 60s edge cache + revalidation. Meeting type config changes are rare and
// done by Remi via admin; eventual consistency is fine.
export const revalidate = 60;

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("meeting_types")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ types: data });
}
