import Link from "next/link";
import PageHeader from "../../../_components/PageHeader";
import OwnerChip from "../../../_components/OwnerChip";
import RecordButton from "@/app/admin/capture/_components/RecordButton";
import { TYPE } from "@/lib/admin/typeScale";
import { ctxHasPermission, type OrgContext } from "@/lib/admin/auth";
import { hasEntitlement } from "@/lib/admin/entitlements";
import { getActiveOrgMembers } from "@/lib/admin/owners-server";
import { constituentName } from "@/lib/fundraising/display";
import { loadPipelineConfig, stageByKey, stagesForPipeline } from "@/lib/fundraising/stages";
import { shortDay, usd } from "@/lib/fundraising/donorRecord";
import { todayInTZ } from "@/lib/admin/ops/week";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * One Pipeline board card on its own page (/admin/fundraising/pipeline/<id>
 * when <id> is an opportunity, not an ask). The board's "Open" link and the
 * donor record's ask list point here. The facts the card shows, plus the
 * owner chip: the member owner (add_owner_id_opportunities.sql), falling back
 * to the older free-text owner until one is assigned. Editing the rest of
 * the ask stays on the board's Edit dialog.
 */

export type OpportunityDetailRow = {
  id: string;
  name: string | null;
  stage: string;
  pipeline: string | null;
  ask_amount: number | null;
  expected_close: string | null;
  probability: number | null;
  owner: string | null;
  owner_id: string | null;
  next_step: string | null;
  next_step_due: string | null;
  notes: string | null;
  constituent: { id: string; type: string; first_name: string | null; last_name: string | null; org_name: string | null } | null;
};

export const OPPORTUNITY_DETAIL_COLUMNS =
  "id, name, stage, pipeline, ask_amount, expected_close, probability, owner, owner_id, next_step, next_step_due, notes, " +
  "constituent:constituents(id, type, first_name, last_name, org_name)";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 border-b border-hairline last:border-b-0">
      <dt className={TYPE.metadata}>{label}</dt>
      <dd className="text-sm text-ink-1 text-right">{children}</dd>
    </div>
  );
}

export default async function OpportunityDetail({ opp, ctx }: { opp: OpportunityDetailRow; ctx: OrgContext }) {
  const supabase = createServerSupabase();
  const [config, members, canAssign, captureEnabled] = await Promise.all([
    loadPipelineConfig(supabase, ctx.orgId),
    getActiveOrgMembers(),
    ctxHasPermission(ctx, "fundraising.write"),
    hasEntitlement("ai.capture"),
  ]);
  const stage = stageByKey(stagesForPipeline(config, opp.pipeline ?? "default"), opp.stage);
  const donor = opp.constituent ? constituentName(opp.constituent as Parameters<typeof constituentName>[0]) : "";
  const heading = opp.name?.trim() || donor || "Ask";
  const today = todayInTZ();

  return (
    <div className="min-h-screen bg-ink">
      <div className="max-w-workspace px-4 lg:px-8 py-6 lg:py-8 space-y-6">
        <PageHeader
          eyebrow={
            <Link href="/admin/fundraising/pipeline" className="hover:text-ink-1 transition-colors">
              ← Pipeline
            </Link>
          }
          title={heading}
          chips={
            <OwnerChip
              entity="opportunities"
              id={opp.id}
              ownerId={opp.owner_id}
              fallbackText={opp.owner}
              members={members}
              meId={ctx.userId}
              canEdit={canAssign}
            />
          }
          actions={
            captureEnabled ? <RecordButton context={{ type: "opportunity", id: opp.id, name: donor || heading }} /> : undefined
          }
        />

        <section className="bg-tile border-hairline rounded-panel-lg p-5 max-w-xl">
          <dl>
            <Fact label="Donor">
              {opp.constituent ? (
                <Link href={`/admin/fundraising/donors-funders/${opp.constituent.id}`} className="text-orange hover:text-orange-dark">
                  {donor}
                </Link>
              ) : (
                "No donor linked"
              )}
            </Fact>
            <Fact label="Stage">{stage?.label ?? opp.stage}</Fact>
            <Fact label="Ask">{opp.ask_amount != null ? usd(Number(opp.ask_amount)) : "No amount"}</Fact>
            <Fact label="Expected close">{opp.expected_close ? shortDay(opp.expected_close, today) : "No close date"}</Fact>
            {opp.probability != null && <Fact label="Probability">{opp.probability}%</Fact>}
            <Fact label="Next step">
              {opp.next_step ? `${opp.next_step}${opp.next_step_due ? `, due ${shortDay(opp.next_step_due, today)}` : ""}` : "No next step yet"}
            </Fact>
          </dl>
          {opp.notes && <p className={`${TYPE.bodyMuted} mt-4 whitespace-pre-wrap`}>{opp.notes}</p>}
        </section>
      </div>
    </div>
  );
}
