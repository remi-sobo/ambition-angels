import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

// Health vocabulary (strategy objects: objective / goal / KPI).
const STATUSES = ["not_started", "on_track", "at_risk", "behind", "done"] as const;
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
  if (typeof body.title === "string" && body.title.trim())
    update.title = body.title.trim().slice(0, 300);
  if ("three_year_statement" in body)
    update.three_year_statement =
      body.three_year_statement === null || body.three_year_statement === ""
        ? null
        : typeof body.three_year_statement === "string"
        ? body.three_year_statement.slice(0, 2000)
        : undefined;
  if (update.three_year_statement === undefined) delete update.three_year_statement;
  if ("owner" in body)
    update.owner =
      body.owner === null || body.owner === ""
        ? null
        : typeof body.owner === "string"
        ? body.owner.trim().slice(0, 60)
        : undefined;
  if (update.owner === undefined) delete update.owner;
  if (typeof body.sort_order === "number" && Number.isFinite(body.sort_order))
    update.sort_order = Math.trunc(body.sort_order);
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: before } = await supabase
    .from("plan_objectives").select("*").eq("id", params.id).eq("org_id", ctx.orgId).maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase
    .from("plan_objectives").update(update).eq("id", params.id).eq("org_id", ctx.orgId);
  if (error) {
    console.error("Update objective failed:", error.message);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  await audit(req, {
    action: "governance.objective.update",
    entityType: "plan_objective",
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
    .from("plan_objectives").select("*").eq("id", params.id).eq("org_id", ctx.orgId).maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Goals point here ON DELETE SET NULL; KPIs attached to this objective
  // ON DELETE CASCADE. Goals (and their initiatives/KPIs) survive, unparented.
  const { error } = await supabase
    .from("plan_objectives").delete().eq("id", params.id).eq("org_id", ctx.orgId);
  if (error) {
    console.error("Delete objective failed:", error.message);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
  await audit(req, {
    action: "governance.objective.delete",
    entityType: "plan_objective",
    entityId: params.id,
    before,
  });
  return NextResponse.json({ ok: true });
}
