import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { stageKeyFromLabel, type StageType } from "@/lib/fundraising/stages";

const STAGE_TYPES: StageType[] = ["open", "won", "lost", "on_hold"];

/**
 * POST /api/admin/pipeline-stages — add a stage to a pipeline (Epic 1b stage
 * editor). The key is derived from the label and permanent (opportunities
 * reference it by FK); the new stage lands at the end of the board. Writes go
 * through the user-session client, so the fundraising.write RLS policy is the
 * real gate (decision D4).
 */
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const pipeline = typeof body.pipeline === "string" ? body.pipeline : "";
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 60) : "";
  const stageType = STAGE_TYPES.includes(body.stage_type as StageType)
    ? (body.stage_type as StageType)
    : "open";
  const probability =
    typeof body.probability_default === "number" &&
    body.probability_default >= 0 &&
    body.probability_default <= 100
      ? Math.round(body.probability_default)
      : null;
  if (!pipeline || !label) {
    return NextResponse.json({ error: "pipeline and label are required" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { data: pipelineRow } = await supabase
    .from("pipelines")
    .select("key")
    .eq("org_id", ctx.orgId)
    .eq("key", pipeline)
    .maybeSingle();
  if (!pipelineRow) {
    return NextResponse.json({ error: "Unknown pipeline" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("pipeline_stages")
    .select("key, sort_order")
    .eq("org_id", ctx.orgId)
    .eq("pipeline", pipeline);
  const taken = new Set((existing ?? []).map((s) => s.key as string));
  const base = stageKeyFromLabel(label);
  let key = base;
  for (let i = 2; taken.has(key); i++) key = `${base}_${i}`;
  const sortOrder =
    (existing ?? []).reduce((m, s) => Math.max(m, (s.sort_order as number) ?? 0), 0) + 1;

  const insert = {
    org_id: ctx.orgId,
    pipeline,
    key,
    label,
    sort_order: sortOrder,
    stage_type: stageType,
    probability_default: probability,
  };
  const { data: created, error } = await supabase
    .from("pipeline_stages")
    .insert(insert)
    .select("id")
    .single();
  if (error || !created) {
    console.error("Create pipeline stage failed:", error?.message);
    return NextResponse.json({ error: "Could not create stage" }, { status: 500 });
  }

  await audit(req, {
    action: "fundraising.stage.create",
    entityType: "pipeline_stage",
    entityId: created.id,
    after: insert,
  });

  return NextResponse.json({ id: created.id, key });
}
