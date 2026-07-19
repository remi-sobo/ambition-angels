import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";

/**
 * GET   /api/admin/imports/[id] — run status + per-row results (preview/resume).
 * PATCH /api/admin/imports/[id] — update the column→field mapping (mapping step).
 *
 * Both are org-fenced: the run must belong to the session org.
 */

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

async function loadRun(id: string, orgId: string) {
  const supabase = getSupabaseAdmin();
  // Org fence: service-role client bypasses RLS — scope to the caller's org.
  const { data } = await supabase.from("imports").select("*").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!data || (data as { org_id: string }).org_id !== orgId) return null;
  return data as Record<string, unknown> & { id: string; status: string; mapping: { header?: string[]; map?: Record<string, string> } };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const run = await loadRun(params.id, ctx.orgId);
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: rows } = await getSupabaseAdmin()
    .from("import_rows")
    .select("row_num, status, verdict, error, matched_entity_id")
    .eq("org_id", ctx.orgId)
    .eq("import_id", params.id)
    .order("row_num");
  return NextResponse.json({
    id: run.id,
    status: run.status,
    filename: run.filename ?? null,
    entity_type: run.entity_type,
    mapping: run.mapping ?? {},
    counts: run.counts ?? {},
    rows: rows ?? [],
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const run = await loadRun(params.id, ctx.orgId);
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Mapping is only editable before commit begins; staged runs may remap and
  // re-stage (the wizard's back button).
  if (run.status !== "mapping" && run.status !== "staged") {
    return NextResponse.json({ error: `Cannot remap a ${run.status} import` }, { status: 409 });
  }

  const body = (await req.json().catch(() => null)) as { map?: unknown } | null;
  if (!body?.map || typeof body.map !== "object" || Array.isArray(body.map)) {
    return NextResponse.json({ error: "map object is required" }, { status: 400 });
  }
  const map: Record<string, string> = {};
  for (const [col, target] of Object.entries(body.map as Record<string, unknown>)) {
    if (typeof target === "string" && target) map[col.slice(0, 200)] = target.slice(0, 100);
  }

  const { error } = await getSupabaseAdmin()
    .from("imports")
    .update({ mapping: { ...(run.mapping ?? {}), map }, status: "mapping" })
    .eq("org_id", ctx.orgId)
    .eq("id", params.id);
  if (error) {
    console.error("Update import mapping failed:", error.message);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
