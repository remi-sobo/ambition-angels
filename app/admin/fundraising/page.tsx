import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { money } from "../finance/_components/charts";
import PageHeader from "../_components/PageHeader";
import SectionSummary from "../_components/SectionSummary";
import StatCard from "../_components/StatCard";
import { NewOpportunityForm } from "./_components/PipelineBoard";
import OpportunitiesBoard from "./_components/OpportunitiesBoard";
import { type OpportunityRow } from "./_components/pipeline-stages";
import FilterTabs from "./_components/FilterTabs";
import {
  HUBSPOT_PIPELINES,
  FUNDRAISING_PIPELINE_ID,
  EXCLUDE_PARTNERSHIP_OPPS,
  PARTNERSHIP_PIPELINE_ID,
  ARCHIVED_PARTNERSHIP_PIPELINE_ID,
} from "@/lib/hubspot/stage-map";
import {
  loadPipelineConfig,
  stagesForPipeline,
  stageByKey,
  stageKeysOfType,
} from "@/lib/fundraising/stages";
import { inYear, futureCloseYears } from "@/lib/fundraising/pipeline-year";

// Major Gifts — the moves-management pipeline (modules/03-fundraising.md
// "Major Gifts"). /admin/fundraising is the pipeline home; the HubSpot
// prospect-research list lives at /admin/fundraising/prospects.
export const dynamic = "force-dynamic";

type DbOpportunity = {
  id: string;
  name: string | null;
  stage: string;
  pipeline: string | null;
  ask_amount: number | null;
  expected_close: string | null;
  probability: number | null;
  capacity_rating: number | null;
  affinity_rating: number | null;
  owner: string | null;
  next_step: string | null;
  next_step_due: string | null;
  notes: string | null;
  constituent:
    | {
        id: string;
        type: string;
        first_name: string | null;
        last_name: string | null;
        org_name: string | null;
        external_ids: Record<string, unknown> | null;
      }
    | null;
};

function constituentName(c: DbOpportunity["constituent"]): string {
  if (!c) return "Unknown";
  if (c.type === "organization") return c.org_name ?? "Unknown org";
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unknown";
}

export default async function MajorGiftsPage({
  searchParams,
}: {
  searchParams?: { pipeline?: string; year?: string };
}) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return <div className="px-4 lg:px-8 py-6 text-sm text-ink-2">Not authorized.</div>;
  }
  const supabase = createServerSupabase();
  // Stage columns + forecast buckets come from per-org config
  // (pipeline_stages); falls back to the legacy five-stage funnel until the
  // config migration is applied. Everything is pinned to the ACTIVE org —
  // RLS alone would merge rows from every org the user belongs to.
  const configPromise = loadPipelineConfig(supabase, ctx.orgId);
  const { data } = await supabase
    .from("opportunities")
    .select(
      `id, name, stage, pipeline, ask_amount, expected_close, probability,
       capacity_rating, affinity_rating, owner, next_step, next_step_due, notes,
       constituent:constituents ( id, type, first_name, last_name, org_name, external_ids )`
    )
    .eq("org_id", ctx.orgId)
    // Fundraising is money-only: the partnership pipeline now lives in /admin/partners.
    .or(EXCLUDE_PARTNERSHIP_OPPS)
    .order("next_step_due", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(1000);

  const allOpps: OpportunityRow[] = ((data ?? []) as unknown as DbOpportunity[]).map((o) => ({
    id: o.id,
    label: o.name ?? constituentName(o.constituent),
    constituentId: o.constituent?.id ?? null,
    // Empty (not "Unknown") when a deal has no linked contact/company, so the
    // card shows just the deal name instead of a phantom "Unknown" subtitle.
    constituentName: o.constituent ? constituentName(o.constituent) : "",
    hubspotId:
      typeof o.constituent?.external_ids?.["hubspot"] === "string"
        ? (o.constituent.external_ids["hubspot"] as string)
        : null,
    stage: o.stage,
    pipeline: o.pipeline,
    askAmount: o.ask_amount,
    expectedClose: o.expected_close,
    probability: o.probability,
    capacityRating: o.capacity_rating,
    affinityRating: o.affinity_rating,
    owner: o.owner,
    nextStep: o.next_step,
    nextStepDue: o.next_step_due,
    notes: o.notes,
  }));

  const config = await configPromise;

  // Pipeline tabs come from config (minus the retired/archived partnership
  // pipelines, which live in /admin/partners). Boards render one pipeline at a
  // time — with per-pipeline stage taxonomies there is no coherent "all
  // pipelines" column set.
  const pipelineOptions = (
    config.fromConfig
      ? config.pipelines
          .filter(
            (p) =>
              p.key !== PARTNERSHIP_PIPELINE_ID &&
              p.key !== ARCHIVED_PARTNERSHIP_PIPELINE_ID
          )
          .map((p) => ({ value: p.key, label: p.label }))
      : Object.entries(HUBSPOT_PIPELINES).map(([value, label]) => ({ value, label }))
  );

  // Filters (URL-driven): pipeline defaults to the fundraising (Sales)
  // pipeline so Major Gifts is money-only; year is the calendar fiscal year
  // and drives the close forecast (expected_close).
  const requestedPipeline = searchParams?.pipeline ?? FUNDRAISING_PIPELINE_ID;
  const pipelineFilter = pipelineOptions.some((p) => p.value === requestedPipeline)
    ? requestedPipeline
    : FUNDRAISING_PIPELINE_ID;
  const currentYear = new Date().getFullYear();
  const year = searchParams?.year ?? String(currentYear);
  const opps = allOpps.filter((o) => (o.pipeline ?? "default") === pipelineFilter);

  const yearOptions = [
    { value: String(currentYear), label: "This year" },
    { value: String(currentYear - 1), label: "Last year" },
    ...futureCloseYears(opps, currentYear).map((y) => ({
      value: String(y),
      label: String(y),
    })),
    { value: "all", label: "All time" },
  ];

  // Stage columns + forecast buckets for the selected pipeline, from config:
  // `open` carries weighted pipeline value, `won` is committed, `lost` and
  // `on_hold` are excluded from both.
  const stages = stagesForPipeline(config, pipelineFilter);
  const openKeys = stageKeysOfType(stages, "open");
  const wonKeys = stageKeysOfType(stages, "won");

  // Everything on the board — open asks and won/lost outcomes alike — is
  // scoped to the selected year by expected close date, so a pledge dated to
  // a future year stays out of view (and out of every total) until that
  // year's filter is selected. Entries with no close date aren't dated to any
  // year, so they stay visible under every filter.
  const boardOpps = opps.filter((o) => inYear(o, year));
  const open = boardOpps.filter((o) => openKeys.includes(o.stage));
  const committed = boardOpps.filter((o) => wonKeys.includes(o.stage));
  // Weighted value: per-ask probability, else the stage's config default.
  const probabilityOf = (o: OpportunityRow) =>
    o.probability ?? stageByKey(stages, o.stage)?.probabilityDefault ?? 50;
  const pipelineValue = open.reduce((s, o) => s + (o.askAmount ?? 0), 0);
  const weightedValue = open.reduce(
    (s, o) => s + ((o.askAmount ?? 0) * probabilityOf(o)) / 100,
    0
  );
  const committedValue = committed.reduce((s, o) => s + (o.askAmount ?? 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  const overdueMoves = open.filter((o) => o.nextStepDue && o.nextStepDue < today).length;

  // Forecast: open asks with a close date — `open` is already year-scoped,
  // so this just drops the undated ones.
  const closing = open.filter((o) => o.expectedClose);
  const closingValue = closing.reduce((s, o) => s + (o.askAmount ?? 0), 0);
  const closingWeighted = closing.reduce(
    (s, o) => s + ((o.askAmount ?? 0) * probabilityOf(o)) / 100,
    0
  );
  const closingLabel = year === "all" ? "Closing (all open)" : `Closing ${year}`;

  // "Identified → Closed Won" (first stage → won stage) for the header.
  const funnelSpan =
    stages.length > 0
      ? `${stages[0].label} → ${
          stages.find((s) => s.stageType === "won")?.label ?? stages[stages.length - 1].label
        }`
      : "";

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1400px]">
      <PageHeader
        title="Pipeline"
        subtitle={`Moves-management pipeline · ${funnelSpan}`}
        actions={
          <div className="flex items-center gap-3">
            <Link
              href="/admin/fundraising/settings/stages"
              className="text-xs font-semibold text-ink-2 hover:text-ink-1 bg-tile hover:bg-[#EFE6D4] border-[1.5px] border-outline px-4 py-2 rounded-full transition-colors"
            >
              Edit stages
            </Link>
            <Link
              href="/admin/fundraising/prospects"
              className="text-xs font-semibold text-ink-2 hover:text-ink-1 bg-tile hover:bg-[#EFE6D4] border-[1.5px] border-outline px-4 py-2 rounded-full transition-colors"
            >
              Prospect research →
            </Link>
            <NewOpportunityForm />
          </div>
        }
      />

      <SectionSummary section="major_gifts" />

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <FilterTabs
          options={pipelineOptions}
          current={pipelineFilter}
          paramKey="pipeline"
          basePath="/admin/fundraising"
          extraParams={{ year }}
        />
        <FilterTabs
          options={yearOptions}
          current={year}
          paramKey="year"
          basePath="/admin/fundraising"
          extraParams={{ pipeline: pipelineFilter }}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard
          label="Open pipeline"
          value={money(pipelineValue)}
          sub={`${open.length} open ${open.length === 1 ? "ask" : "asks"}${
            overdueMoves > 0 ? ` · ${overdueMoves} overdue` : ""
          }`}
        />
        <StatCard label="Weighted" value={money(weightedValue)} sub="ask × probability" />
        <StatCard
          label={closingLabel}
          value={money(closingValue)}
          sub={`${closing.length} ${closing.length === 1 ? "ask" : "asks"} · ${money(
            closingWeighted
          )} weighted`}
        />
        <StatCard
          label="Committed"
          value={money(committedValue)}
          sub={`${committed.length} closed won`}
        />
      </div>

      <OpportunitiesBoard opps={boardOpps} stages={stages} />
    </div>
  );
}
