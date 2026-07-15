import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext, ctxHasPermission } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
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
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const text = body && typeof body.body === "string" ? body.body.trim().slice(0, 4000) : "";
  if (!text) return NextResponse.json({ error: "body is required" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: before } = await supabase
    .from("plan_objective_notes").select("*").eq("id", params.id).eq("org_id", ctx.orgId).maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const update = { body: text };
  const { error } = await supabase
    .from("plan_objective_notes").update(update).eq("id", params.id).eq("org_id", ctx.orgId);
  if (error) {
    console.error("Update objective note failed:", error.message);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  await audit(req, {
    action: "governance.objective_note.update",
    entityType: "plan_objective_note",
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
  if (!(await ctxHasPermission(ctx, "org.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  const { data: before } = await supabase
    .from("plan_objective_notes").select("*").eq("id", params.id).eq("org_id", ctx.orgId).maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase
    .from("plan_objective_notes").delete().eq("id", params.id).eq("org_id", ctx.orgId);
  if (error) {
    console.error("Delete objective note failed:", error.message);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
  await audit(req, {
    action: "governance.objective_note.delete",
    entityType: "plan_objective_note",
    entityId: params.id,
    before,
  });
  return NextResponse.json({ ok: true });
}
