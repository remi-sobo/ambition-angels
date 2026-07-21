import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Per-org pipeline/stage configuration (tables `pipelines` + `pipeline_stages`,
 * migration fundraising_pipeline_config.sql). The pipeline board, the
 * opportunity APIs, and the outbound HubSpot stage push all read stages from
 * here — stage taxonomy is data, not code.
 *
 * Fallback: until the config migrations are applied (or for an org with no
 * seeded rows), everything degrades to the legacy five-stage moves funnel, so
 * deploying this code ahead of the migration changes nothing.
 *
 * For cheap "is this stage open/won/lost" checks in peripheral consumers, use
 * lib/fundraising/stage-sets.ts instead — it needs no query.
 */

export type StageType = "open" | "won" | "lost" | "on_hold";

export type PipelineStage = {
  pipeline: string;
  key: string;
  label: string;
  sortOrder: number;
  stageType: StageType;
  /** HubSpot dealstage internal id (null = no HubSpot counterpart). */
  externalStageId: string | null;
  probabilityDefault: number | null;
  isActive: boolean;
};

export type PipelineOption = {
  key: string;
  label: string;
  sortOrder: number;
  isDefault: boolean;
};

export type PipelineConfig = {
  pipelines: PipelineOption[];
  stages: PipelineStage[];
  /** False when serving the legacy fallback (config tables absent or empty). */
  fromConfig: boolean;
};

/** The pre-config moves funnel, served when no config rows exist. */
export const LEGACY_STAGES: PipelineStage[] = [
  { key: "identify", label: "Identification", sortOrder: 1, stageType: "open", probabilityDefault: 10 },
  { key: "qualify", label: "Qualification", sortOrder: 2, stageType: "open", probabilityDefault: 25 },
  { key: "cultivate", label: "Cultivation", sortOrder: 3, stageType: "open", probabilityDefault: 40 },
  { key: "solicit", label: "Solicitation", sortOrder: 4, stageType: "open", probabilityDefault: 75 },
  { key: "steward", label: "Stewardship", sortOrder: 5, stageType: "won", probabilityDefault: 100 },
  { key: "lost", label: "Lost", sortOrder: 6, stageType: "lost", probabilityDefault: 0 },
].map((s) => ({ ...s, pipeline: "default", externalStageId: null, isActive: true })) as PipelineStage[];

const LEGACY_PIPELINES: PipelineOption[] = [
  { key: "default", label: "Sales Pipeline", sortOrder: 0, isDefault: true },
];

const legacyConfig = (): PipelineConfig => ({
  pipelines: LEGACY_PIPELINES,
  stages: LEGACY_STAGES,
  fromConfig: false,
});

/**
 * Load one org's pipeline/stage config. `orgId` is required: RLS is a
 * security boundary, not an active-org selector — a user with memberships in
 * several orgs sees ALL of their orgs' rows through the user client, and
 * without the explicit filter every stage renders once per org (duplicate
 * board columns). Pages pass getOrgContext().orgId; service-role callers pass
 * the org they're operating on.
 */
export async function loadPipelineConfig(
  supabase: SupabaseClient,
  orgId: string
): Promise<PipelineConfig> {
  try {
    const pipelineQuery = supabase
      .from("pipelines")
      .select("key, label, sort_order, is_default")
      .eq("org_id", orgId)
      .order("sort_order");
    const stageQuery = supabase
      .from("pipeline_stages")
      .select("pipeline, key, label, sort_order, stage_type, external_stage_id, probability_default, is_active")
      .eq("org_id", orgId)
      .order("sort_order");
    const [{ data: pipelines, error: pErr }, { data: stages, error: sErr }] =
      await Promise.all([pipelineQuery, stageQuery]);
    if (pErr || sErr || !stages || stages.length === 0) return legacyConfig();

    return {
      pipelines: (pipelines ?? []).map((p) => ({
        key: p.key as string,
        label: p.label as string,
        sortOrder: (p.sort_order as number) ?? 0,
        isDefault: p.is_default === true,
      })),
      stages: stages.map((s) => ({
        pipeline: s.pipeline as string,
        key: s.key as string,
        label: s.label as string,
        sortOrder: (s.sort_order as number) ?? 0,
        stageType: s.stage_type as StageType,
        externalStageId: (s.external_stage_id as string | null) ?? null,
        probabilityDefault: (s.probability_default as number | null) ?? null,
        isActive: s.is_active !== false,
      })),
      fromConfig: true,
    };
  } catch {
    return legacyConfig();
  }
}

/**
 * Active stages of one pipeline, in board order. A pipeline with no config
 * rows renders the legacy funnel (re-keyed to that pipeline) so pre-migration
 * data still gets columns.
 */
export function stagesForPipeline(config: PipelineConfig, pipeline: string): PipelineStage[] {
  const rows = config.stages
    .filter((s) => s.pipeline === pipeline && s.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  if (rows.length > 0) return rows;
  return LEGACY_STAGES.map((s) => ({ ...s, pipeline }));
}

/** Where a brand-new ask starts: the pipeline's first active open stage. */
export function firstOpenStageKey(stages: PipelineStage[]): string {
  return stages.find((s) => s.stageType === "open")?.key ?? stages[0]?.key ?? "identify";
}

export function stageByKey(stages: PipelineStage[], key: string): PipelineStage | undefined {
  return stages.find((s) => s.key === key);
}

export function stageKeysOfType(stages: PipelineStage[], type: StageType): string[] {
  return stages.filter((s) => s.stageType === type).map((s) => s.key);
}

/**
 * Derive a stable stage key from a display label ("Needs Appointment" →
 * "needs_appointment"). Keys are permanent once created (opportunities
 * reference them via FK); only the label is renameable in the editor.
 */
export function stageKeyFromLabel(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "stage"
  );
}
