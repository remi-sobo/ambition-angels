import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("partner_waitlist")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const signups = data ?? [];

  // Role breakdown
  const roleBreakdown: Record<string, number> = {};
  for (const s of signups) {
    const role = s.role ?? "Other";
    roleBreakdown[role] = (roleBreakdown[role] ?? 0) + 1;
  }

  const roleBreakdownSorted = Object.entries(roleBreakdown)
    .sort((a, b) => b[1] - a[1])
    .map(([role, count]) => ({ role, count }));

  return NextResponse.json({ signups, roleBreakdown: roleBreakdownSorted });
}
