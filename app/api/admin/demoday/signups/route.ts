import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";

// Postgres "relation does not exist" — surfaced if the create_demoday_signups
// migration hasn't been applied yet. Treated as "no signups" so the tab still
// renders instead of erroring.
const UNDEFINED_TABLE = "42P01";

// ── GET /api/admin/demoday/signups ───────────────────────────────────────────
// Returns every Demo Day signup, newest first. Powers the Signups tab on
// /admin/demoday.
export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  // Org fence: service-role client bypasses RLS — scope to the caller's org.
  const { data, error } = await supabase
    .from("demoday_signups")
    .select("id, created_at, first_name, last_name, email, phone, company, title, engagement, note, source")
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false });

  if (error) {
    if (error.code === UNDEFINED_TABLE) {
      return NextResponse.json({ signups: [], tableMissing: true });
    }
    console.error("[/api/admin/demoday/signups GET] supabase error:", {
      code: error.code,
      message: error.message,
    });
    return NextResponse.json({ error: "Failed to fetch signups" }, { status: 500 });
  }

  return NextResponse.json({ signups: data ?? [] });
}
