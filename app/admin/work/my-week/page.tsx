import { ButtonLink } from "@/app/admin/_components/ui/Button";
import Badge from "@/app/admin/_components/ui/Badge";
import WeekSection from "@/app/admin/calendar/WeekSection";
import { loadRhythmSnapshot } from "@/lib/admin/ops/rhythm";
import { rhythmModeForToday } from "@/lib/admin/ops/rhythmMode";
import { buildMondayStatus, buildFridayStatus, type WeekStatus } from "@/lib/admin/ops/statusLine";
import { formatWeekHeader, formatDayLabel, todayInTZ } from "@/lib/admin/ops/week";
import WeekStatusLine from "@/app/admin/ops/_components/WeekStatusLine";
import CalendarSyncBanner from "@/app/admin/ops/_components/CalendarSyncBanner";
import PageHeader from "@/app/admin/_components/PageHeader";
import { TYPE } from "@/lib/admin/typeScale";
import { requirePagePermission } from "@/app/admin/_components/PermissionGate";

// Spec Work W2 — My Week becomes the week grid (the Handoff Spec folds
// Calendar into My Week; recon §G: calendar_events + work_blocks +
// work_block_tasks + calendar_prefs). Composition: the week status line,
// one door to the lit ritual (Plan & Close carries both flows since W1, so
// the two doors collapse to one), then the grid — WeekSection embedded with
// basePath here, so week/owner navigation stays on this screen and
// ?week=/?owner= links keep working after /admin/calendar's W4 308.
export const dynamic = "force-dynamic";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default async function MyWeekPage({
  searchParams,
}: {
  searchParams?: { week?: string; owner?: string };
}) {
  const roleGate = await requirePagePermission("ops.read", "My work");
  if (!roleGate.ok) return roleGate.page;
  const mode = rhythmModeForToday();
  const snapshot = await loadRhythmSnapshot(mode);

  const status: WeekStatus | null = snapshot
    ? snapshot.mode === "monday_plan"
      ? buildMondayStatus(snapshot.who.role, snapshot.counts)
      : buildFridayStatus(snapshot.who.role, snapshot.counts)
    : null;

  const weekOf = snapshot?.weekOf ?? null;
  const planLit = mode === "monday_plan";

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-workspace">
      <PageHeader
        title="My Week"
        subtitle={
          <span className="flex items-baseline gap-3 flex-wrap">
            {weekOf && <span className="text-ink-2">Week of {formatWeekHeader(weekOf)}</span>}
            <span className="text-ink-3">·</span>
            <span className="text-ink-2">{formatDayLabel(todayInTZ())}</span>
            {snapshot && (
              <>
                <span className="text-ink-3">·</span>
                <span className="text-ink-2">as {cap(snapshot.who.handle)}</span>
              </>
            )}
          </span>
        }
        primaryAction={
          // The one ritual door: Plan & Close carries both flows, and the
          // time of the week picks which one this button names.
          <ButtonLink variant="primary" href="/admin/work/plan-close">
            {planLit ? "Plan the week" : "Close the week"}
          </ButtonLink>
        }
        moreActions={[
          { label: "Tasks", href: "/admin/work/tasks" },
          { label: "Meetings", href: "/admin/work/meetings" },
          { label: "Calendar settings", href: "/admin/settings/connections" },
        ]}
      />

      {/* ── WeekStatus ─────────────────────────────────────────────────── */}
      <CalendarSyncBanner className="mt-2" />
      <section aria-label="This week" className="mt-4 rounded-panel border border-hairline bg-surface p-5">
        <div className={`${TYPE.sectionHeader} mb-2`}>
          {planLit ? "Monday · Aim" : "Friday · Account"} <Badge tone="accent">Now</Badge>
        </div>
        {status ? (
          <WeekStatusLine status={status} />
        ) : (
          <p className="text-sm text-ink-2">Sign in to see this week&apos;s read.</p>
        )}
      </section>

      {/* ── The week grid, embedded ────────────────────────────────────── */}
      <WeekSection
        embedded
        basePath="/admin/work/my-week"
        searchParams={searchParams}
      />
    </div>
  );
}
