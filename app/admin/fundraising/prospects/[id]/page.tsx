import ProspectProfile from "./ProspectProfile";

// The V1 prospect detail route. The whole screen lives in ProspectProfile
// (extracted at Spec Fundraising F2) so the Donor 360 can render the
// prospect variant of the one URL shape; here it renders unchanged —
// output byte-identical to the pre-F2 page. At F6 this route 308s to the
// 360, which resolves the same fr_prospects id.
export default async function ProspectDetailPage({ params }: { params: { id: string } }) {
  return <ProspectProfile id={params.id} />;
}
