import RevenueSection from "./RevenueSection";

// The V1 revenue route. The whole screen lives in RevenueSection (extracted
// at Spec Finance N2) so Forecast embeds the same tiers; here it renders
// standalone with the default basePath — output byte-identical to the
// pre-N2 page. At the N4 cutover this route 308s to Forecast.
export const dynamic = "force-dynamic";

export default async function RevenuePage({
  searchParams,
}: {
  searchParams: { year?: string };
}) {
  return <RevenueSection searchParams={searchParams} />;
}
