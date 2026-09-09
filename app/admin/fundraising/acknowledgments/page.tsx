import AckQueue from "./AckQueue";

// The V1 acknowledgments route. The whole queue lives in AckQueue (extracted
// at Spec Fundraising F5) so Fundraising → Today's Moves embeds the same
// actionable queue; here it renders standalone — output byte-identical to
// the pre-F5 page. At F6 this route 308s to /admin/fundraising/today
// (templates get their Settings seat separately, per the map row's note).
export const dynamic = "force-dynamic";

export default async function AcknowledgmentsPage() {
  return <AckQueue />;
}
