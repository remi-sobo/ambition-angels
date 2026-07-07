import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { hasPermission } from "@/lib/admin/permissions";
import { audit } from "@/lib/audit";
import { isUuid } from "@/app/admin/staff/_lib/guard";

// POST /api/admin/staff/reorder — set sort_order = position for an ordered list of
// sibling staff ids (drag-and-drop reorder). staff.write only.
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createServerSupabase();
  if (!(await hasPermission(supabase, ctx.orgId, "staff.write"))) {
    return NextResponse.json({ error: "You can't reorder staff." }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { orderedIds?: unknown } | null;
  const ids = Array.isArray(body?.orderedIds) ? body!.orderedIds : [];
  if (!ids.length || !ids.every(isUuid)) {
    return NextResponse.json({ error: "orderedIds must be a non-empty array of ids." }, { status: 400 });
  }

  // One update per id (small lists). Scoped to the org so RLS + the eq guard hold.
  for (let i = 0; i < ids.length; i++) {
    const { error } = await supabase
      .from("staff")
      .update({ sort_order: i })
      .eq("id", ids[i] as string)
      .eq("org_id", ctx.orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await audit(req, { action: "staff.reorder", entityType: "staff", after: { count: ids.length } });
  return NextResponse.json({ ok: true });
}
