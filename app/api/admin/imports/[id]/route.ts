import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/admin/requirePermission";
import { ctxHasPermission } from "@/lib/admin/auth";
import { importPerm } from "@/lib/admin/imports/perm";

/**
 * GET   /api/admin/imports/[id] — run status + per-row results (preview/resume).
 * PATCH /api/admin/imports/[id] — update the column→field mapping (mapping step).
 *
 * Both are org-fenced: the run must belong to the session org.
 */

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

function previewSummary(spine: Record<string, unknown> | null): string | null {
  if (!spine) return null;
  const person = [spine.first_name, spine.last_name].filter((v) => typeof v === "string" && v).join(" ");
  const name = person || (typeof spine.org_name === "string" ? spine.org_name : "") || (typeof spine.email === "string" ? spine.email : "");
  const amount = typeof spine.amount === "number" ? ` · $${spine.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "";
  const date = typeof spine.gift_date === "string" && amount ? ` on ${spine.gift_date}` : "";
  return `${name}${amount}${date}` || null;
}

async function loadRun(id: string, orgId: string) {
  const supabase = getSupabaseAdmin();
  // Org fence: service-role client bypasses RLS — scope to the caller's org.
  const { data } = await supabase.from("imports").select("*").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!data || (data as { org_id: string }).org_id !== orgId) return null;
  return data as Record<string, unknown> & { id: string; status: string; mapping: { header?: string[]; map?: Record<string, string>; cohort_id?: string | null } };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requirePermission(["program.read", "fundraising.read"]);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const ctx = guard.ctx;
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const run = await loadRun(params.id, ctx.orgId);
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await ctxHasPermission(ctx, importPerm(String(run.entity_type), "read")))) {
    return NextResponse.json({ error: "You don't have permission to see that import." }, { status: 403 });
  }

  const { data: rows } = await getSupabaseAdmin()
    .from("import_rows")
    .select("row_num, status, verdict, error, matched_entity_id, normalized")
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
    // The preview shows a short summary per row (name, and the gift for a
    // gift import), never the raw file row.
    rows: ((rows ?? []) as { normalized?: { spine?: Record<string, unknown>; donor?: string | null } | null }[]).map(({ normalized, ...r }) => ({
      ...r,
      summary: previewSummary(normalized?.spine ?? null),
      donor: normalized?.donor ?? null,
    })),
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requirePermission(["program.write", "fundraising.write"]);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const ctx = guard.ctx;
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const run = await loadRun(params.id, ctx.orgId);
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await ctxHasPermission(ctx, importPerm(String(run.entity_type), "write")))) {
    return NextResponse.json({ error: "You don't have permission to import that." }, { status: 403 });
  }
  // Mapping is only editable before commit begins; staged runs may remap and
  // re-stage (the wizard's back button).
  if (run.status !== "mapping" && run.status !== "staged") {
    return NextResponse.json({ error: `Cannot remap a ${run.status} import` }, { status: 409 });
  }

  const body = (await req.json().catch(() => null)) as { map?: unknown; cohort_id?: unknown } | null;
  if (!body?.map || typeof body.map !== "object" || Array.isArray(body.map)) {
    return NextResponse.json({ error: "map object is required" }, { status: 400 });
  }
  const map: Record<string, string> = {};
  for (const [col, target] of Object.entries(body.map as Record<string, unknown>)) {
    if (typeof target === "string" && target) map[col.slice(0, 200)] = target.slice(0, 100);
  }

  // V4 Stage E: "put everyone in this cohort". A cohort id must be a cohort
  // of the ACTIVE org; null clears it; absent leaves it as it was.
  let cohortPatch: { cohort_id?: string | null } = {};
  if (body.cohort_id === null || body.cohort_id === "") cohortPatch = { cohort_id: null };
  else if (body.cohort_id !== undefined) {
    if (!isUuid(body.cohort_id)) return NextResponse.json({ error: "Choose a cohort." }, { status: 400 });
    const { data: cohort } = await getSupabaseAdmin()
      .from("cohorts")
      .select("id")
      .eq("org_id", ctx.orgId)
      .eq("id", body.cohort_id)
      .maybeSingle();
    if (!cohort) return NextResponse.json({ error: "That cohort is not in this organization." }, { status: 404 });
    cohortPatch = { cohort_id: cohort.id as string };
  }

  const { error } = await getSupabaseAdmin()
    .from("imports")
    .update({ mapping: { ...(run.mapping ?? {}), map, ...cohortPatch }, status: "mapping" })
    .eq("org_id", ctx.orgId)
    .eq("id", params.id);
  if (error) {
    console.error("Update import mapping failed:", error.message);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
