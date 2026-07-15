import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext, ctxHasPermission } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

// Restore a soft-deleted objective (clear deleted_at). Backs both the inline
// Undo right after a delete and the "Deleted charts" panel on the OGSM review
// page. sort_order is untouched, so the chart reappears in its old position.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await ctxHasPermission(ctx, "org.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  const { data: before } = await supabase
    .from("plan_objectives").select("*").eq("id", params.id).eq("org_id", ctx.orgId).maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase
    .from("plan_objectives").update({ deleted_at: null }).eq("id", params.id).eq("org_id", ctx.orgId);
  if (error) {
    console.error("Restore objective failed:", error.message);
    return NextResponse.json({ error: "Restore failed" }, { status: 500 });
  }
  await audit(req, {
    action: "governance.objective.restore",
    entityType: "plan_objective",
    entityId: params.id,
    before,
    after: { deleted_at: null },
  });
  return NextResponse.json({ ok: true });
}
