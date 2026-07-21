import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import PageHeader from "../../../_components/PageHeader";
import StagesEditor from "./_components/StagesEditor";
import { loadPipelineConfig } from "@/lib/fundraising/stages";

// Epic 1b — the pipeline stage editor. Stages are per-org rows
// (pipeline_stages, seeded by fundraising_pipeline_config.sql); this page is
// the UI on top: add / rename / reorder / retype / deactivate / delete, gated
// on fundraising.write via RLS. The board, forecast buckets, and HubSpot stage
// sync all read the same rows, so edits take effect everywhere on refresh.
export const dynamic = "force-dynamic";

export default async function PipelineStagesSettingsPage() {
  const ctx = await getOrgContext();
  if (!ctx) {
    return <div className="px-4 lg:px-8 py-6 text-sm text-ink-2">Not authorized.</div>;
  }
  const supabase = createServerSupabase();
  // Active-org scoped: a multi-org member's RLS view spans every org they
  // belong to, so each query pins org_id rather than trusting RLS.
  const [config, oppsRes] = await Promise.all([
    loadPipelineConfig(supabase, ctx.orgId),
    supabase.from("opportunities").select("pipeline, stage").eq("org_id", ctx.orgId).limit(10000),
  ]);

  // How many asks sit in each (pipeline, stage) — powers the "move cards
  // first" guards' counts in the UI.
  const usage: Record<string, number> = {};
  for (const o of (oppsRes.data ?? []) as Array<{ pipeline: string | null; stage: string }>) {
    const k = `${o.pipeline ?? "default"}:${o.stage}`;
    usage[k] = (usage[k] ?? 0) + 1;
  }

  // The editor needs stage ids; the shared loader intentionally omits them,
  // so fetch the raw rows here (active-org scoped).
  const { data: rawStages } = await supabase
    .from("pipeline_stages")
    .select("id, pipeline, key, label, sort_order, stage_type, external_stage_id, probability_default, is_active")
    .eq("org_id", ctx.orgId)
    .order("sort_order");

  return (
    <div className="min-h-screen bg-ink">
      <div className="max-w-[900px] px-4 lg:px-8 py-6 lg:py-8 space-y-6">
        <PageHeader
          title="Pipeline stages"
          subtitle="Columns, forecast buckets, and HubSpot stage mapping — per pipeline"
          actions={
            <Link
              href="/admin/fundraising"
              className="text-xs font-semibold text-ink-2 hover:text-ink-1 bg-tile hover:bg-[#EFE6D4] border-[1.5px] border-outline px-4 py-2 rounded-full transition-colors"
            >
              ← Pipeline board
            </Link>
          }
        />
        {!config.fromConfig ? (
          <p className="text-sm text-ink-2">
            Stage configuration hasn&apos;t been migrated yet — the board is running on the built-in
            legacy funnel. Apply the pipeline config migrations first.
          </p>
        ) : (
          <StagesEditor
            pipelines={config.pipelines}
            stages={(rawStages ?? []).map((s) => ({
              id: s.id as string,
              pipeline: s.pipeline as string,
              key: s.key as string,
              label: s.label as string,
              sortOrder: (s.sort_order as number) ?? 0,
              stageType: s.stage_type as "open" | "won" | "lost" | "on_hold",
              externalStageId: (s.external_stage_id as string | null) ?? null,
              probabilityDefault: (s.probability_default as number | null) ?? null,
              isActive: s.is_active !== false,
            }))}
            usage={usage}
          />
        )}
      </div>
    </div>
  );
}
