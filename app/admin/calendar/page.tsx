import { getOrgContext } from "@/lib/admin/auth";
import { getWeekView } from "@/lib/agenda/week-view";
import { mondayOf, todayInTZ } from "@/lib/admin/ops/week";
import PageHeader from "../_components/PageHeader";
import WeekGrid from "./WeekGrid";

/**
 * The week grid (specs/bloomos-calendar-time-blocking.md §4): meetings as
 * fixed rock, work blocks drawn into the gaps, open time visible, one week at
 * a glance. Week and viewed owner ride the URL so the grid is linkable and
 * the back button works: /admin/calendar?week=YYYY-MM-DD&owner=<uuid>.
 */
export const dynamic = "force-dynamic";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function CalendarPage({
  searchParams,
}: {
  searchParams?: { week?: string; owner?: string };
}) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return <div className="px-4 lg:px-8 py-6 text-sm text-ink-2">Not authorized.</div>;
  }

  const todayISO = todayInTZ();
  const rawWeek = searchParams?.week;
  const weekStart = mondayOf(rawWeek && DAY_RE.test(rawWeek) ? rawWeek : todayISO);
  const ownerParam = searchParams?.owner ?? ctx.userId;

  const view = await getWeekView({
    ctx,
    weekStart,
    ownerUserId: ownerParam,
    todayISO,
  });

  const weekLabel = new Date(weekStart + "T12:00:00Z").toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8">
      <PageHeader
        title="Calendar"
        subtitle={
          view.owner.relation === "self"
            ? `Week of ${weekLabel} — meetings, work blocks, and open time`
            : `${view.owner.name}'s week of ${weekLabel} — read-only`
        }
      />
      <WeekGrid view={view} />
    </div>
  );
}
