import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAaOnly } from "@/lib/admin/aaOnly";
import { requirePermission } from "@/lib/admin/requirePermission";

export async function GET() {
  const guard = await requirePermission("program.read");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
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
