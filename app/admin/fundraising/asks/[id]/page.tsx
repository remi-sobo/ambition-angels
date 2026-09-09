import AskDetail from "./AskDetail";

// The V1 ask-detail route. The whole screen lives in AskDetail (extracted at
// Spec Fundraising F6) so /admin/fundraising/pipeline/[id] — where this
// URL's 308 lands at cutover — renders the same screen; here it renders
// unmodified, output byte-identical to the pre-F6 page.
export const dynamic = "force-dynamic";

export default async function AskDetailPage({ params }: { params: { id: string } }) {
  return <AskDetail id={params.id} />;
}
