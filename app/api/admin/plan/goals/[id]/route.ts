import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const STATUSES = ["on_track", "at_risk", "behind", "done"] as const;
const OVERRIDE_STATUSES = ["not_started", "on_track", "at_risk", "behind", "done"] as const;
const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (STATUSES.includes(body.status as (typeof STATUSES)[number])) update.status = body.status;
  // Reasoned status override (B2-1): null clears it (back to computed roll-up).
  if ("status_override" in body) {
    if (body.status_override === null || body.status_override === "") {
      update.status_override = null;
      update.status_override_reason = null;
    } else if (OVERRIDE_STATUSES.includes(body.status_override as (typeof OVERRIDE_STATUSES)[number])) {
      update.status_override = body.status_override;
      update.status_override_reason =
        typeof body.status_override_reason === "string" ? body.status_override_reason.trim().slice(0, 300) : null;
    }
  }
  if (typeof body.title === "string" && body.title.trim())
    update.title = body.title.trim().slice(0, 300);
  if ("description" in body)
    update.description =
      body.description === null || body.description === ""
        ? null
        : typeof body.description === "string"
        ? body.description.slice(0, 2000)
        : undefined;
  if (update.description === undefined) delete update.description;
  if ("owner" in body)
    update.owner =
      body.owner === null || body.owner === ""
        ? null
        : typeof body.owner === "string"
        ? body.owner.trim().slice(0, 60)
        : undefined;
  if (update.owner === undefined) delete update.owner;
  if ("objective_id" in body) {
    if (body.objective_id === null || body.objective_id === "") update.objective_id = null;
    else if (isUuid(body.objective_id)) update.objective_id = body.objective_id;
  }
  if ("target_date" in body) {
    if (body.target_date === null || body.target_date === "") update.target_date = null;
    else if (isISODate(body.target_date)) update.target_date = body.target_date;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  // org_id scoping is the tenant boundary on the service-role client.
  const { data: before } = await supabase
    .from("plan_goals").select("*").eq("id", params.id).eq("org_id", ctx.orgId).maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase
    .from("plan_goals").update(update).eq("id", params.id).eq("org_id", ctx.orgId);
  if (error) {
    console.error("Update goal failed:", error.message);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  await audit(req, {
    action: "governance.goal.update",
    entityType: "plan_goal",
    entityId: params.id,
    before,
    after: update,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  const { data: before } = await supabase
    .from("plan_goals").select("*").eq("id", params.id).eq("org_id", ctx.orgId).maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase
    .from("plan_goals").delete().eq("id", params.id).eq("org_id", ctx.orgId);
  if (error) {
    console.error("Delete goal failed:", error.message);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
  await audit(req, {
    action: "governance.goal.delete",
    entityType: "plan_goal",
    entityId: params.id,
    before,
  });
  return NextResponse.json({ ok: true });
}
