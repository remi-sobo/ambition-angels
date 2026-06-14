import Link from "next/link";
import SectionHeading from "../_components/SectionHeading";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { money } from "../finance/_components/charts";
import PageHeader from "../_components/PageHeader";
import StatCard from "../_components/StatCard";
import { NewOpportunityForm, OpportunityCard } from "./_components/PipelineBoard";
import {
  PIPELINE_STAGES,
  STAGE_LABELS,
  type OpportunityRow,
} from "./_components/pipeline-stages";

// Major Gifts — the moves-management pipeline (modules/03-fundraising.md
// "Major Gifts"). /admin/fundraising is the pipeline home; the HubSpot
// prospect-research list lives at /admin/fundraising/prospects.
export const dynamic = "force-dynamic";

type DbOpportunity = {
  id: string;
  name: string | null;
  stage: string;
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

export default async function MajorGiftsPage() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("opportunities")
    .select(
      `id, name, stage, ask_amount, expected_close, probability,
       capacity_rating, owner, next_step, next_step_due,
       constituent:constituents ( id, type, first_name, last_name, org_name, external_ids )`
    )
    .order("next_step_due", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(500);

  const opps: OpportunityRow[] = ((data ?? []) as unknown as DbOpportunity[]).map((o) => ({
    id: o.id,
    label: o.name ?? constituentName(o.constituent),
    constituentId: o.constituent?.id ?? null,
    constituentName: constituentName(o.constituent),
    hubspotId:
      typeof o.constituent?.external_ids?.["hubspot"] === "string"
        ? (o.constituent.external_ids["hubspot"] as string)
        : null,
    stage: o.stage,
    askAmount: o.ask_amount,
    expectedClose: o.expected_close,
    probability: o.probability,
    capacityRating: o.capacity_rating,
    owner: o.owner,
    nextStep: o.next_step,
    nextStepDue: o.next_step_due,
  }));

  // Open stages carry weighted pipeline value; steward = committed.
  const openStages = ["identify", "qualify", "cultivate", "solicit"];
  const open = opps.filter((o) => openStages.includes(o.stage));
  const committed = opps.filter((o) => o.stage === "steward");
  const pipelineValue = open.reduce((s, o) => s + (o.askAmount ?? 0), 0);
  const weightedValue = open.reduce(
    (s, o) => s + ((o.askAmount ?? 0) * (o.probability ?? 50)) / 100,
    0
  );
  const committedValue = committed.reduce((s, o) => s + (o.askAmount ?? 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  const overdueMoves = open.filter((o) => o.nextStepDue && o.nextStepDue < today).length;

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1400px]">
      <PageHeader
        title="Major Gifts"
        subtitle="Moves-management pipeline · Identification → Stewardship"
        actions={
          <div className="flex items-center gap-3">
            <Link
              href="/admin/fundraising/prospects"
              className="text-xs font-semibold text-cream/70 hover:text-cream bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-full transition-colors"
            >
              Prospect research →
            </Link>
            <NewOpportunityForm />
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard
          label="Open pipeline"
          value={money(pipelineValue)}
          sub={`${open.length} open ${open.length === 1 ? "ask" : "asks"}`}
        />
        <StatCard label="Weighted" value={money(weightedValue)} sub="ask × probability" />
        <StatCard
          label="Committed"
          value={money(committedValue)}
          sub={`${committed.length} in stewardship`}
        />
        <StatCard
          label="Overdue next steps"
          value={overdueMoves}
          sub={overdueMoves > 0 ? "needs a move" : "all current"}
          muted={overdueMoves === 0}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 items-start">
        {PIPELINE_STAGES.map((stage) => {
          const col = opps.filter((o) => o.stage === stage);
          const colValue = col.reduce((s, o) => s + (o.askAmount ?? 0), 0);
          return (
            <section
              key={stage}
              className="bg-white/[0.03] border border-white/10 rounded-card p-3 min-h-[120px]"
            >
              <header className="flex items-baseline justify-between px-1 mb-3">
                <SectionHeading>
                  {STAGE_LABELS[stage]}
                </SectionHeading>
                <span className="text-[11px] text-gray-mid tabular-nums">
                  {col.length} · {money(colValue)}
                </span>
              </header>
              <div className="space-y-2">
                {col.slice(0, 12).map((o) => (
                  <OpportunityCard key={o.id} opp={o} />
                ))}
                {col.length > 12 && (
                  <details>
                    <summary className="text-xs text-gray-mid cursor-pointer hover:text-cream/70 px-1 py-1">
                      Show {col.length - 12} more
                    </summary>
                    <div className="space-y-2 mt-2">
                      {col.slice(12).map((o) => (
                        <OpportunityCard key={o.id} opp={o} />
                      ))}
                    </div>
                  </details>
                )}
                {col.length === 0 && (
                  <p className="text-xs text-gray-mid/60 px-1 pb-1">Empty</p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {opps.some((o) => o.stage === "lost") && (
        <details className="mt-6">
          <summary className="text-xs text-gray-mid cursor-pointer hover:text-cream/70">
            Lost ({opps.filter((o) => o.stage === "lost").length})
          </summary>
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-3 mt-3">
            {opps
              .filter((o) => o.stage === "lost")
              .map((o) => (
                <OpportunityCard key={o.id} opp={o} />
              ))}
          </div>
        </details>
      )}
    </div>
  );
}
