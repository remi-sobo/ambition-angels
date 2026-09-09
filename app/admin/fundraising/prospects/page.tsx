import ProspectBench from "./ProspectBench";

// The V1 prospects route. The whole bench lives in ProspectBench (extracted
// at Spec Fundraising F4) so the R1 research drawer off Donors & Funders
// renders the same bench; here it renders standalone with the default
// basePath — output byte-identical to the pre-F4 page. At F6 this route
// 308s into Donors & Funders.
export const dynamic = "force-dynamic";

export default async function FundraisingProspectsPage({
  searchParams,
}: {
  searchParams?: { show?: string };
}) {
  return <ProspectBench searchParams={searchParams} />;
}
