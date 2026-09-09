import PipelineHome from "./PipelineHome";

// The V1 pipeline home. The whole board lives in PipelineHome (extracted at
// Spec Fundraising F3) so the V2 Pipeline screen at
// /admin/fundraising/pipeline renders the same board above the embedded Ask
// Log; here it renders alone with the default basePath — output
// byte-identical to the pre-F3 page. At F6 this route 308s to
// /admin/fundraising/today (the destination landing).
export const dynamic = "force-dynamic";

export default async function MajorGiftsPage({
  searchParams,
}: {
  searchParams?: { pipeline?: string; year?: string };
}) {
  return <PipelineHome searchParams={searchParams} />;
}
