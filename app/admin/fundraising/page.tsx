import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { money } from "../finance/_components/charts";
import PageHeader from "../_components/PageHeader";
import SectionSummary from "../_components/SectionSummary";
import StatCard from "../_components/StatCard";
import { NewOpportunityForm } from "./_components/PipelineBoard";
import OpportunitiesBoard from "./_components/OpportunitiesBoard";
import { type OpportunityRow } from "./_components/pipeline-stages";
import FilterTabs from "./_components/FilterTabs";
import { HUBSPOT_PIPELINES, FUNDRAISING_PIPELINE_ID, EXCLUDE_PARTNERSHIP_OPPS } from "@/lib/hubspot/stage-map";

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
  owner: string | null;
  next_step: string | null;
  next_step_due: string | null;
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
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("opportunities")
    .select(
      `id, name, stage, pipeline, ask_amount, expected_close, probability,
       capacity_rating, owner, next_step, next_step_due,
       constituent:constituents ( id, type, first_name, last_name, org_name, external_ids )`
    )
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
    owner: o.owner,
    nextStep: o.next_step,
    nextStepDue: o.next_step_due,
  }));

  // Filters (URL-driven): pipeline defaults to the fundraising (Sales)
  // pipeline so Major Gifts is money-only; year is the calendar fiscal year
  // and drives the close forecast (expected_close).
  const pipelineFilter = searchParams?.pipeline ?? FUNDRAISING_PIPELINE_ID;
  const currentYear = new Date().getFullYear();
  const year = searchParams?.year ?? String(currentYear);
  const opps =
    pipelineFilter === "all"
      ? allOpps
      : allOpps.filter((o) => (o.pipeline ?? "default") === pipelineFilter);

  const pipelineOptions = [
    { value: "all", label: "All pipelines" },
    { value: "default", label: HUBSPOT_PIPELINES["default"] },
    { value: "727459407", label: HUBSPOT_PIPELINES["727459407"] },
  ];
  const yearOptions = [
    { value: String(currentYear), label: "This year" },
    { value: String(currentYear - 1), label: "Last year" },
    { value: "all", label: "All time" },
  ];

  // Open stages carry weighted pipeline value; steward = committed.
  const openStages = ["identify", "qualify", "cultivate", "solicit"];
  const open = opps.filter((o) => openStages.includes(o.stage));

  // Stewardship (closed-won) accumulates forever, so scope that column to the
  // selected year by close date — "This year" shows this year's wins, not the
  // all-time pile. Open asks are live work and always show; steward entries
  // with no close date (AIG members, established partnerships) aren't dated
  // wins, so they stay visible too.
  const stewardInYear = (o: OpportunityRow) =>
    year === "all" || !o.expectedClose || o.expectedClose.slice(0, 4) === year;
  const boardOpps = opps.filter((o) => o.stage !== "steward" || stewardInYear(o));
  const committed = boardOpps.filter((o) => o.stage === "steward");
  const pipelineValue = open.reduce((s, o) => s + (o.askAmount ?? 0), 0);
  const weightedValue = open.reduce(
    (s, o) => s + ((o.askAmount ?? 0) * (o.probability ?? 50)) / 100,
    0
  );
  const committedValue = committed.reduce((s, o) => s + (o.askAmount ?? 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  const overdueMoves = open.filter((o) => o.nextStepDue && o.nextStepDue < today).length;

  // Forecast: open asks expected to close in the selected year.
  const closing = open.filter(
    (o) => o.expectedClose && (year === "all" || o.expectedClose.slice(0, 4) === year)
  );
  const closingValue = closing.reduce((s, o) => s + (o.askAmount ?? 0), 0);
  const closingWeighted = closing.reduce(
    (s, o) => s + ((o.askAmount ?? 0) * (o.probability ?? 50)) / 100,
    0
  );
  const closingLabel = year === "all" ? "Closing (all open)" : `Closing ${year}`;

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1400px]">
      <PageHeader
        title="Pipeline"
        subtitle="Moves-management pipeline · Identification → Stewardship"
        actions={
          <div className="flex items-center gap-3">
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
          sub={`${committed.length} in stewardship`}
        />
      </div>

      <OpportunitiesBoard opps={boardOpps} />
    </div>
  );
}
