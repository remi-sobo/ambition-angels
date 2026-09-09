import ConnectionsSection from "./ConnectionsSection";

// The V1 connections route. The whole pipeline lives in ConnectionsSection
// (extracted at Spec Work W3) so Work → Meetings embeds the same queue; here
// it renders standalone — output byte-identical to the pre-W3 page. At the
// W4 cutover this route 308s to /admin/work/meetings.
export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  return <ConnectionsSection />;
}
