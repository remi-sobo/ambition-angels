import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const getSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

export async function GET() {
  const cookieStore = await cookies();
  const authed = cookieStore.get("admin_authed")?.value === "true";
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabase();
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
