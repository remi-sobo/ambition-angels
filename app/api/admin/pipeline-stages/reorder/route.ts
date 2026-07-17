import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

/**
 * POST /api/admin/pipeline-stages/reorder — rewrite a pipeline's stage order.
 * Body: { pipeline, ordered_ids: [stageId, ...] }. The list must be exactly
 * the pipeline's stages (a partial list would leave duplicate sort_orders);
 * sort_order becomes the list index + 1.
 */
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as
    | { pipeline?: unknown; ordered_ids?: unknown }
    | null;
  const pipeline = typeof body?.pipeline === "string" ? body.pipeline : "";
  const orderedIds = Array.isArray(body?.ordered_ids)
    ? body!.ordered_ids.filter((x): x is string => typeof x === "string")
    : [];
  if (!pipeline || orderedIds.length === 0) {
    return NextResponse.json({ error: "pipeline and ordered_ids are required" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { data: rows } = await supabase
    .from("pipeline_stages")
    .select("id")
    .eq("org_id", ctx.orgId)
    .eq("pipeline", pipeline);
  const current = new Set((rows ?? []).map((r) => r.id as string));
  if (
    current.size !== orderedIds.length ||
    orderedIds.some((id) => !current.has(id)) ||
    new Set(orderedIds).size !== orderedIds.length
  ) {
    return NextResponse.json(
      { error: "ordered_ids must be exactly this pipeline's stages" },
      { status: 400 }
    );
  }

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from("pipeline_stages")
      .update({ sort_order: i + 1 })
      .eq("id", orderedIds[i]);
    if (error) {
      console.error("Reorder pipeline stages failed:", error.message);
      return NextResponse.json({ error: "Reorder failed" }, { status: 500 });
    }
  }

  await audit(req, {
    action: "fundraising.stage.reorder",
    entityType: "pipeline_stage",
    entityId: pipeline,
    after: { pipeline, ordered_ids: orderedIds },
  });

  return NextResponse.json({ ok: true });
}
