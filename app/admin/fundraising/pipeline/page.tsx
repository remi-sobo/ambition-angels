import PipelineHome from "../PipelineHome";
import AskLog from "../asks/AskLog";

// Spec Fundraising, stage F3 — Pipeline: the opportunities board merged
// with the ask log on one screen (spec §Scope). Reachable by URL only until
// F6 — the shell tab still resolves to /admin/fundraising/asks (its merge
// seat) and no redirect exists yet. Recomposition, not a fork: the board is
// PipelineHome (the V1 /admin/fundraising page's extracted body, filter
// tabs pointed at THIS route) and the log is AskLog embedded (section
// heading instead of page chrome). Ask rows keep linking the live V1
// detail at /admin/fundraising/asks/[id]; F6 owns giving that detail its
// V2 seat before the asks prefix row activates.
export const dynamic = "force-dynamic";

export default async function PipelinePage({
  searchParams,
}: {
  searchParams?: { pipeline?: string; year?: string };
}) {
  return (
    <div className="min-h-screen bg-ink">
      <PipelineHome searchParams={searchParams} basePath="/admin/fundraising/pipeline" />
      <div className="max-w-[1400px] px-4 lg:px-8 pb-6 lg:pb-8">
        <AskLog embedded />
      </div>
    </div>
  );
}
