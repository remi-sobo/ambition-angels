import PledgesSection from "./PledgesSection";

// The V1 pledges route. The whole screen lives in PledgesSection (extracted
// at Spec Finance N2) so Finance → Forecast embeds the same pledges-due
// tier; here it renders standalone — output byte-identical to the pre-N2
// page. At the N4 cutover this route 308s to Forecast (exact — pledges/[id]
// stays live until Donor 360 absorbs pledge history, per the spec).
export const dynamic = "force-dynamic";

export default async function PledgesPage() {
  return <PledgesSection />;
}
