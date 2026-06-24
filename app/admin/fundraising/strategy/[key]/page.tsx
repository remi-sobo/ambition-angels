import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import PageHeader from "../../../_components/PageHeader";
import { constituentName } from "@/lib/fundraising/display";
import StrategyBoard, { type FunderRow } from "../_components/StrategyBoard";
import DiscoverPanel from "../_components/DiscoverPanel";

// Strategy angle drill-in (Phase 2): the funnel board for one angle. Funders
// are grouped by stage; add via constituent search/create; move stage + record
// go/no-go. Research link + pursue→opportunity arrive in Phase 3.
export const dynamic = "force-dynamic";

type RawFa = {
  id: string;
  stage: string;
  decision: string | null;
  fit_notes: string | null;
  opportunity_id: string | null;
  prospect_id: string | null;
  constituent: {
    id: string;
    type: string;
    first_name: string | null;
    last_name: string | null;
    org_name: string | null;
    emails: string[] | null;
    external_ids: Record<string, unknown> | null;
  } | null;
};

export default async function AngleFunnelPage({ params }: { params: { key: string } }) {
  const supabase = createServerSupabase();

  const { data: angle, error } = await supabase
    .from("strategy_angles")
    .select("id, key, name, status_badge, hook")
    .eq("key", params.key)
    .maybeSingle();
  if (error || !angle) notFound();

  const { data: faData } = await supabase
    .from("funder_angles")
    .select(
      `id, stage, decision, fit_notes, opportunity_id, prospect_id,
       constituent:constituents ( id, type, first_name, last_name, org_name, emails, external_ids )`
    )
    .eq("angle_id", angle.id)
    .order("created_at", { ascending: true });

  const funders: FunderRow[] = ((faData ?? []) as unknown as RawFa[]).map((r) => ({
    id: r.id,
    stage: r.stage,
    decision: r.decision,
    fitNotes: r.fit_notes,
    opportunityId: r.opportunity_id,
    prospectId: r.prospect_id,
    constituentId: r.constituent?.id ?? null,
    name: r.constituent ? constituentName(r.constituent) : "Unknown",
    email: r.constituent?.emails?.[0] ?? null,
    hubspotId:
      typeof r.constituent?.external_ids?.["hubspot"] === "string"
        ? (r.constituent.external_ids["hubspot"] as string)
        : null,
  }));

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1100px]">
      <PageHeader
        title={angle.name}
        subtitle={angle.hook ?? "Funding angle"}
        actions={
          <Link
            href="/admin/fundraising/strategy"
            className="text-xs font-semibold text-ink-2 hover:text-ink-1 bg-tile hover:bg-[#EFE6D4] border-[1.5px] border-outline px-4 py-2 rounded-full transition-colors"
          >
            ← Strategy
          </Link>
        }
      />
      <div className="mb-5">
        <DiscoverPanel angleId={angle.id} angleName={angle.name} />
      </div>
      <StrategyBoard angleId={angle.id} funders={funders} />
    </div>
  );
}
