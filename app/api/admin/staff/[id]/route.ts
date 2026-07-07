import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { hasPermission } from "@/lib/admin/permissions";
import { audit } from "@/lib/audit";
import { isUuid, str } from "@/app/admin/staff/_lib/guard";

const EMPLOYMENT = new Set(["staff", "contractor", "volunteer", "board"]);
const STATUS = new Set(["active", "inactive"]);

// PATCH /api/admin/staff/:id — HR-admin edit of a person (title, department,
// employment type, manager, status, sort order, name, start date). staff.write
// only. The reports_to validation trigger blocks a cross-org or cyclic manager.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createServerSupabase();
  if (!(await hasPermission(supabase, ctx.orgId, "staff.write"))) {
    return NextResponse.json({ error: "You can't edit staff." }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Expected JSON" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if ("full_name" in body) {
    const n = str(body.full_name, 200);
    if (!n) return NextResponse.json({ error: "Name can't be empty." }, { status: 400 });
    patch.full_name = n;
  }
  if ("title" in body) patch.title = str(body.title, 200);
  if ("department" in body) patch.department = str(body.department, 120);
  if ("start_date" in body) patch.start_date = str(body.start_date, 10);
  if ("employment_type" in body) {
    if (!EMPLOYMENT.has(String(body.employment_type)))
      return NextResponse.json({ error: "Bad employment type." }, { status: 400 });
    patch.employment_type = String(body.employment_type);
  }
  if ("status" in body) {
    if (!STATUS.has(String(body.status)))
      return NextResponse.json({ error: "Bad status." }, { status: 400 });
    patch.status = String(body.status);
  }
  if ("sort_order" in body) patch.sort_order = Number(body.sort_order) || 0;
  if ("reports_to" in body) {
    const rt = body.reports_to;
    if (rt === null || rt === "") patch.reports_to = null;
    else if (isUuid(rt)) {
      if (rt === params.id) return NextResponse.json({ error: "A person can't report to themselves." }, { status: 400 });
      patch.reports_to = rt;
    } else return NextResponse.json({ error: "Bad manager id." }, { status: 400 });
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  const { data, error } = await supabase
    .from("staff")
    .update(patch)
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .select("*")
    .maybeSingle();
  if (error) {
    // The reports_to trigger raises on same-org / cycle violations.
    const bad = /same org|cycle|report to itself|too deep/i.test(error.message);
    return NextResponse.json({ error: error.message }, { status: bad ? 400 : 400 });
  }
  if (!data) return NextResponse.json({ error: "Staff member not found" }, { status: 404 });

  await audit(req, { action: "staff.update", entityType: "staff", entityId: params.id, after: patch });
  return NextResponse.json({ ok: true, staff: data });
}
