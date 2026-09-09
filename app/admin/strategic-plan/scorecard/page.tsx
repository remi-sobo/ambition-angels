import ScorecardSection from "./ScorecardSection";

// The V1 scorecard route. The whole owner-segmented view lives in
// ScorecardSection (extracted at Spec Impact I3) so Impact → KPIs embeds the
// same cards; here it renders standalone — output byte-identical to the
// pre-I3 page. At the I4 cutover this route 308s to /admin/impact/kpis.
export const dynamic = "force-dynamic";

export default async function ScorecardPage() {
  return <ScorecardSection />;
}
