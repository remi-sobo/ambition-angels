import { getOrgContext } from "@/lib/admin/auth";
import { getWeekView } from "@/lib/agenda/week-view";
import { mondayOf, todayInTZ } from "@/lib/admin/ops/week";
import PageHeader from "../_components/PageHeader";
import WeekGrid from "./WeekGrid";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * The week grid (specs/bloomos-calendar-time-blocking.md §4): meetings as
 * fixed rock, work blocks drawn into the gaps, open time visible, one week at
 * a glance. Week and viewed owner ride the URL so the grid is linkable and
 * the back button works: ?week=YYYY-MM-DD&owner=<uuid>.
 *
 * Extracted at Spec Work W2: the V1 route (/admin/calendar) renders it
 * standalone — output byte-identical to the pre-W2 page — and Work → My Week
 * embeds the same grid under its status line (the Handoff Spec folds
 * Calendar into My Week). basePath keeps the grid's own week/owner
 * navigation on whichever screen renders it. At the W4 cutover the
 * standalone route 308s to /admin/work/my-week.
 */

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function WeekSection({
  searchParams,
  basePath = "/admin/calendar",
  embedded = false,
}: {
  searchParams?: { week?: string; owner?: string };
  basePath?: string;
  embedded?: boolean;
}) {
  const ctx = await getOrgContext();
  if (!ctx) {
    if (embedded) return null;
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

  if (embedded) {
    return (
      <section className="mt-6">
        <div className="mb-3">
          <h2 className={TYPE.cardTitle}>
            {view.owner.relation === "self"
              ? `Week of ${weekLabel}`
              : `${view.owner.name}'s week of ${weekLabel} — read-only`}
          </h2>
          <p className="text-[11px] text-ink-3">
            Meetings as fixed rock, work blocks in the gaps, open time visible.
          </p>
        </div>
        <WeekGrid view={view} basePath={basePath} />
      </section>
    );
  }

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
