import KpisPage from "@/app/admin/kpis/page";
import ScorecardSection from "@/app/admin/strategic-plan/scorecard/ScorecardSection";

// Spec Impact I3 — KPIs absorbs the scorecard (decision 3, resolved: its map
// row rules it merged here, and a working surface is absorbed, not parked).
// Composition: the V1 Metric Catalog hub (unmodified) → the embedded
// owner-segmented scorecard, in-place editing intact.
// /admin/strategic-plan/scorecard stays byte-identical until its I4 308.
export const dynamic = "force-dynamic";

export default async function ImpactKpisPage() {
  return (
    <>
      <KpisPage />
      <div className="px-4 lg:px-8 pb-6 lg:pb-8 max-w-[1100px]">
        <ScorecardSection embedded />
      </div>
    </>
  );
}
