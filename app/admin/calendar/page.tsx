import WeekSection from "./WeekSection";

// The V1 calendar route. The whole week grid lives in WeekSection (extracted
// at Spec Work W2) so Work → My Week embeds the same grid; here it renders
// standalone — output byte-identical to the pre-W2 page. At the W4 cutover
// this route 308s to /admin/work/my-week.
export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams?: { week?: string; owner?: string };
}) {
  return <WeekSection searchParams={searchParams} />;
}
