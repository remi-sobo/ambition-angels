import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext, ctxHasPermission } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await ctxHasPermission(ctx, "org.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const text = body && typeof body.body === "string" ? body.body.trim().slice(0, 4000) : "";
  const objectiveId = isUuid(body?.objective_id) ? (body!.objective_id as string) : null;
  if (!text || !objectiveId) {
    return NextResponse.json({ error: "body and objective_id are required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  // The note inherits its objective's org — and the objective must be in the
  // caller's org, so a cross-tenant objective_id can't be hijacked.
  const { data: objective } = await supabase
    .from("plan_objectives").select("id").eq("id", objectiveId).eq("org_id", ctx.orgId).maybeSingle();
  if (!objective) return NextResponse.json({ error: "Objective not found" }, { status: 404 });

  const insert = {
    org_id: ctx.orgId,
    objective_id: objectiveId,
    body: text,
    // Attribution: the email local-part, same convention as ops created_by.
    author: ctx.email.split("@")[0]?.toLowerCase() ?? null,
  };
  const { data, error } = await supabase
    .from("plan_objective_notes")
    .insert(insert)
    .select("id")
    .single();
  if (error || !data) {
    console.error("Create objective note failed:", error?.message);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
  await audit(req, {
    action: "governance.objective_note.create",
    entityType: "plan_objective_note",
    entityId: data.id,
    after: insert,
  });
  return NextResponse.json({ id: data.id });
}
