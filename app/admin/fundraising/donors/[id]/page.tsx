import DonorProfile from "./DonorProfile";

// The V1 donor profile route. The whole screen lives in DonorProfile
// (extracted at Spec Fundraising F2) so the Donor 360 at
// /admin/fundraising/donors-funders/[id] renders the same component with
// its 360-only panels; here it renders with none — output byte-identical
// to the pre-F2 page. At F6 this route 308s to the 360.
export const dynamic = "force-dynamic";

export default async function DonorProfilePage({ params }: { params: { id: string } }) {
  return <DonorProfile id={params.id} />;
}
