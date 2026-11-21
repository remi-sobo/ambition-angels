import KpisPage from "@/app/admin/kpis/page";
import ScorecardSection from "@/app/admin/strategic-plan/scorecard/ScorecardSection";

// Spec Impact I3: KPIs absorbs the scorecard (decision 3, resolved: its map
// row rules it merged here, and a working surface is absorbed, not parked).
// Composition: the Metric Catalog hub (V4 Stage G2, the List archetype) →
// the embedded owner-segmented scorecard, in-place editing intact.
// The view and department filters live in the URL, so they are passed
// through (before G2 they were dropped here and the filters did nothing).
export const dynamic = "force-dynamic";

export default async function ImpactKpisPage({
  searchParams,
}: {
  searchParams?: { dept?: string; view?: string };
}) {
  return (
    <>
      <KpisPage searchParams={searchParams} />
      <div className="px-4 lg:px-8 pb-6 lg:pb-8 max-w-workspace">
        <ScorecardSection embedded />
      </div>
    </>
  );
}
