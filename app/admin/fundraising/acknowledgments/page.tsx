import AckQueue from "./AckQueue";

// Fundraising → Thank-yous. The whole queue lives in AckQueue (extracted at
// Spec Fundraising F5) so Fundraising → Today embeds the same actionable
// queue. Standalone it is the V4 List archetype on DataTable v2 (B1); views,
// sort and page come from the URL.
export const dynamic = "force-dynamic";

export default async function AcknowledgmentsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | undefined>;
}) {
  return <AckQueue searchParams={searchParams} />;
}
