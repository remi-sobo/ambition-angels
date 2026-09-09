import Link from "next/link";
import WeekSection from "@/app/admin/calendar/WeekSection";
import { loadRhythmSnapshot } from "@/lib/admin/ops/rhythm";
import { rhythmModeForToday } from "@/lib/admin/ops/rhythmMode";
import { buildMondayStatus, buildFridayStatus, type WeekStatus } from "@/lib/admin/ops/statusLine";
import { formatWeekHeader, formatDayLabel, todayInTZ } from "@/lib/admin/ops/week";
import WeekStatusLine from "@/app/admin/ops/_components/WeekStatusLine";
import PageHeader from "@/app/admin/_components/PageHeader";
import { TYPE } from "@/lib/admin/typeScale";

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
    <div className="px-4 lg:px-8 py-6 lg:py-8">
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
      />

      {/* ── WeekStatus + the one ritual door ───────────────────────────── */}
      <section className="mt-6 rounded-card border-[1.5px] border-outline bg-surface p-6">
        {status ? (
          <WeekStatusLine status={status} />
        ) : (
          <p className="text-sm text-ink-2">Sign in to see this week&apos;s read.</p>
        )}
        <Link
          href="/admin/work/plan-close"
          className="mt-4 group flex items-center justify-between gap-4 rounded-card border-[1.5px] border-orange/40 bg-orange-light px-5 py-4 transition-colors hover:bg-[#FFE4D6]"
        >
          <span className="flex items-baseline gap-3 flex-wrap">
            <span className={`${TYPE.sectionHeader} !text-orange-dark`}>
              {planLit ? "Monday · Aim" : "Friday · Account"}
            </span>
            <span className="font-display font-black uppercase tracking-tight text-2xl leading-none text-orange-dark">
              {planLit ? "Plan" : "Close"}
            </span>
            <span className="text-[10px] uppercase tracking-wider font-semibold text-orange-dark border border-orange/40 rounded-full px-1.5 py-px">
              Now
            </span>
          </span>
          <span className="shrink-0 text-sm font-medium text-orange-dark">
            Open Plan &amp; Close →
          </span>
        </Link>
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
