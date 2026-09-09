import AskLog from "./AskLog";

// The V1 ask-log route. The whole screen lives in AskLog (extracted at Spec
// Fundraising F3) so the V2 Pipeline screen embeds it below the board; here
// it renders standalone — output byte-identical to the pre-F3 page. At F6
// this route 308s to /admin/fundraising/pipeline.
export const dynamic = "force-dynamic";

export default async function AsksPage() {
  return <AskLog />;
}
