import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext, ctxHasPermission } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await ctxHasPermission(ctx, "org.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const title = body && typeof body.title === "string" ? body.title.trim().slice(0, 300) : "";
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });

  const insert: Record<string, unknown> = { title, org_id: ctx.orgId };
  if (typeof body?.three_year_statement === "string" && body.three_year_statement.trim())
    insert.three_year_statement = body.three_year_statement.trim().slice(0, 2000);
  if (typeof body?.owner === "string" && body.owner.trim())
    insert.owner = body.owner.trim().slice(0, 60);
  if (typeof body?.sort_order === "number" && Number.isFinite(body.sort_order))
    insert.sort_order = Math.trunc(body.sort_order);

  const { data, error } = await getSupabaseAdmin()
    .from("plan_objectives")
    .insert(insert)
    .select("id")
    .single();
  if (error || !data) {
    console.error("Create objective failed:", error?.message);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
  await audit(req, {
    action: "governance.objective.create",
    entityType: "plan_objective",
    entityId: data.id,
    after: insert,
  });
  return NextResponse.json({ id: data.id });
}
