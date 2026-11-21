import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/admin/requirePermission";

export async function GET() {
  const guard = await requirePermission("program.read");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const ctx = guard.ctx;

  const supabase = getSupabaseAdmin();
  // Org fence: service-role client bypasses RLS — scope to the caller's org.
  const { data, error } = await supabase
    .from("ygb_registrations")
    .select("*")
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("YGB admin registrations error:", error);
    return NextResponse.json({ error: "Failed to load registrations" }, { status: 500 });
  }

  return NextResponse.json({ registrations: data ?? [] });
}
