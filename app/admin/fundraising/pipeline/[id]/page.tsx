import AskDetail from "../../asks/[id]/AskDetail";

// Spec Fundraising, stage F6 — the ask detail's V2 seat. The asks map row
// is a prefix row, so /admin/fundraising/asks/<id> 308s here at cutover;
// this page renders the same extracted AskDetail with its back-link on the
// Pipeline screen, so no stored ask URL ever dies.
export const dynamic = "force-dynamic";

export default async function PipelineAskPage({ params }: { params: { id: string } }) {
  return <AskDetail id={params.id} v2 />;
}
