import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";

// The recoverable archive: soft-deleted objectives ("charts"), newest first.
// Fetched live when the "Deleted charts" panel opens so the list is accurate
// even if the page's server render has gone stale.
export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data, error } = await getSupabaseAdmin()
    .from("plan_objectives")
    .select("id, title, deleted_at")
    .eq("org_id", ctx.orgId)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  if (error) {
    console.error("List deleted objectives failed:", error.message);
    return NextResponse.json({ error: "Load failed" }, { status: 500 });
  }
  return NextResponse.json({ deleted: data ?? [] });
}
