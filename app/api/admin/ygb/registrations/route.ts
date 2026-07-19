import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
