import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { type StageType } from "@/lib/fundraising/stages";

const STAGE_TYPES: StageType[] = ["open", "won", "lost", "on_hold"];

type StageRow = {
  id: string;
  org_id: string;
  pipeline: string;
  key: string;
  label: string;
  stage_type: string;
  is_active: boolean;
};

// How many opportunities sit in this stage right now. Guards deactivate (the
// column would vanish and hide its cards) and delete (the FK would reject it
// anyway — this returns a friendly message instead of a constraint error).
async function usageCount(
  supabase: ReturnType<typeof createServerSupabase>,
  s: StageRow
): Promise<number> {
  const { count } = await supabase
    .from("opportunities")
    .select("id", { count: "exact", head: true })
    .eq("org_id", s.org_id)
    .eq("pipeline", s.pipeline)
    .eq("stage", s.key);
  return count ?? 0;
}

// Whether this stage is the pipeline's only remaining active open stage — the
// create-ask entry point. Deactivating or deleting it would leave new asks
// nowhere to land.
async function isLastOpenStage(
  supabase: ReturnType<typeof createServerSupabase>,
  s: StageRow
): Promise<boolean> {
  if (s.stage_type !== "open" || !s.is_active) return false;
  const { count } = await supabase
    .from("pipeline_stages")
    .select("id", { count: "exact", head: true })
    .eq("org_id", s.org_id)
    .eq("pipeline", s.pipeline)
    .eq("stage_type", "open")
    .eq("is_active", true);
  return (count ?? 0) <= 1;
}

// PATCH /api/admin/pipeline-stages/:id — rename / retype / reprice / toggle a
// stage. The key never changes (FK). PATCHing sort_order is not supported here;
// use the reorder route, which rewrites the whole pipeline consistently.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const supabase = createServerSupabase();
  const { data: before } = await supabase
    .from("pipeline_stages")
    .select("id, org_id, pipeline, key, label, stage_type, is_active")
    .eq("id", params.id)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const stage = before as StageRow;

  const update: Record<string, unknown> = {};
  if ("label" in body && typeof body.label === "string" && body.label.trim()) {
    update.label = body.label.trim().slice(0, 60);
  }
  if ("stage_type" in body && STAGE_TYPES.includes(body.stage_type as StageType)) {
    update.stage_type = body.stage_type;
  }
  if ("probability_default" in body) {
    if (body.probability_default === null) update.probability_default = null;
    else if (
      typeof body.probability_default === "number" &&
      body.probability_default >= 0 &&
      body.probability_default <= 100
    )
      update.probability_default = Math.round(body.probability_default);
  }
  if ("external_stage_id" in body) {
    update.external_stage_id =
      body.external_stage_id === null || body.external_stage_id === ""
        ? null
        : typeof body.external_stage_id === "string"
        ? body.external_stage_id.trim().slice(0, 100)
        : undefined;
    if (update.external_stage_id === undefined) delete update.external_stage_id;
  }
  if ("is_active" in body && typeof body.is_active === "boolean") {
    update.is_active = body.is_active;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  // Guards for changes that would strand cards or the create path.
  const deactivating = update.is_active === false && stage.is_active;
  const retypingAwayFromOpen =
    typeof update.stage_type === "string" &&
    update.stage_type !== "open" &&
    stage.stage_type === "open";
  if (deactivating) {
    const inUse = await usageCount(supabase, stage);
    if (inUse > 0) {
      return NextResponse.json(
        { error: `Move the ${inUse} ask${inUse === 1 ? "" : "s"} in this stage first` },
        { status: 409 }
      );
    }
  }
  if ((deactivating || retypingAwayFromOpen) && (await isLastOpenStage(supabase, stage))) {
    return NextResponse.json(
      { error: "A pipeline needs at least one active open stage" },
      { status: 409 }
    );
  }

  const { error } = await supabase.from("pipeline_stages").update(update).eq("id", params.id);
  if (error) {
    console.error("Update pipeline stage failed:", error.message);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  await audit(req, {
    action: "fundraising.stage.update",
    entityType: "pipeline_stage",
    entityId: params.id,
    before,
    after: update,
  });

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/pipeline-stages/:id — remove an unused stage. Stages with
// asks in them can't be deleted (the composite FK from opportunities would
// reject it); move the cards first.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { data: before } = await supabase
    .from("pipeline_stages")
    .select("id, org_id, pipeline, key, label, stage_type, is_active")
    .eq("id", params.id)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const stage = before as StageRow;

  const inUse = await usageCount(supabase, stage);
  if (inUse > 0) {
    return NextResponse.json(
      { error: `Move the ${inUse} ask${inUse === 1 ? "" : "s"} in this stage first` },
      { status: 409 }
    );
  }
  if (await isLastOpenStage(supabase, stage)) {
    return NextResponse.json(
      { error: "A pipeline needs at least one active open stage" },
      { status: 409 }
    );
  }

  const { error } = await supabase.from("pipeline_stages").delete().eq("id", params.id);
  if (error) {
    console.error("Delete pipeline stage failed:", error.message);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }

  await audit(req, {
    action: "fundraising.stage.delete",
    entityType: "pipeline_stage",
    entityId: params.id,
    before,
  });

  return NextResponse.json({ ok: true });
}
