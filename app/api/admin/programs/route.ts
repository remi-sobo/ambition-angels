import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("program_partners")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Supabase programs error:", error.message);
    return NextResponse.json({ error: "Failed to fetch program partners" }, { status: 500 });
  }

  const signups = data ?? [];

  // Breakdown by program_type
  const breakdown: Record<string, number> = {};
  for (const row of signups) {
    const t = row.program_type ?? "Unknown";
    breakdown[t] = (breakdown[t] ?? 0) + 1;
  }
  const typeBreakdown = Object.entries(breakdown)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({ signups, typeBreakdown });
}
