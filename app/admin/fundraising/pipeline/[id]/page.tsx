import { getOrgContext } from "@/lib/admin/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import AskDetail from "../../asks/[id]/AskDetail";
import OpportunityDetail, { OPPORTUNITY_DETAIL_COLUMNS, type OpportunityDetailRow } from "./OpportunityDetail";

// Spec Fundraising, stage F6 — the ask detail's V2 seat. The asks map row
// is a prefix row, so /admin/fundraising/asks/<id> 308s here at cutover;
// this page renders the same extracted AskDetail with its back-link on the
// Pipeline screen, so no stored ask URL ever dies.
//
// The Pipeline board's "Open" link and the donor record's ask list also point
// here with an OPPORTUNITY id (a board card). That id is looked up first,
// pinned to the active org; an id that is not a board card falls through to
// the ask detail exactly as before.
export const dynamic = "force-dynamic";

export default async function PipelineAskPage({ params }: { params: { id: string } }) {
  if (/^[0-9a-f-]{36}$/i.test(params.id)) {
    const ctx = await getOrgContext();
    if (ctx) {
      const { data } = await createServerSupabase()
        .from("opportunities")
        .select(OPPORTUNITY_DETAIL_COLUMNS)
        .eq("org_id", ctx.orgId)
        .eq("id", params.id)
        .maybeSingle();
      if (data) return <OpportunityDetail opp={data as unknown as OpportunityDetailRow} ctx={ctx} />;
    }
  }
  return <AskDetail id={params.id} v2 />;
}
