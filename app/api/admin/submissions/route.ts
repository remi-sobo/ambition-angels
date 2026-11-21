import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAaOnly } from "@/lib/admin/aaOnly";

export async function GET() {
  const gate = await requireAaOnly("aa.quiz");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("quiz_submissions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ submissions: data });
}
