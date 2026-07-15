import Link from "next/link";
import { loadRhythmSnapshot, rhythmModeForToday } from "@/lib/admin/ops/rhythm";
import { buildMondayStatus, buildFridayStatus, type WeekStatus } from "@/lib/admin/ops/statusLine";
import { formatWeekHeader, formatDayLabel, todayInTZ } from "@/lib/admin/ops/week";
import WeekStatusLine from "../_components/WeekStatusLine";
import PageHeader from "../../_components/PageHeader";
import { TYPE } from "@/lib/admin/typeScale";

export const dynamic = "force-dynamic";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One of the two doors. The time-appropriate one is emphasized. */
function Door({
  href,
  eyebrow,
  title,
  blurb,
  active,
}: {
  href: string;
  eyebrow: string;
  title: string;
  blurb: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "group flex flex-col rounded-card border-[1.5px] p-6 transition-colors",
        active
          ? "border-orange bg-orange-light shadow-panel"
          : "border-outline bg-surface hover:bg-[#EFE6D4]",
      ].join(" ")}
    >
      <div className="flex items-center justify-between">
        <span
          className={[
            TYPE.sectionHeader,
            active ? "!text-orange-dark" : "!text-ink-2",
          ].join(" ")}
        >
          {eyebrow}
        </span>
        {active && (
          <span className="text-[9px] uppercase tracking-wider font-semibold text-orange-dark border border-orange/40 rounded-full px-1.5 py-px">
            Now
          </span>
        )}
      </div>
      <span
        className={[
          "mt-2 font-display font-black uppercase tracking-tight text-3xl leading-none",
          active ? "text-orange-dark" : "text-ink-1 group-hover:text-orange",
        ].join(" ")}
      >
        {title}
      </span>
      <span className="mt-2 text-sm text-ink-2">{blurb}</span>
      <span
        className={[
          "mt-4 text-sm font-medium inline-flex items-center gap-1",
          active ? "text-orange-dark" : "text-ink-2 group-hover:text-orange",
        ].join(" ")}
      >
        Open {title} →
      </span>
    </Link>
  );
}

export default async function MyWeekHubPage() {
  const mode = rhythmModeForToday();
  const snapshot = await loadRhythmSnapshot(mode);

  const status: WeekStatus | null = snapshot
    ? snapshot.mode === "monday_plan"
      ? buildMondayStatus(snapshot.who.role, snapshot.counts)
      : buildFridayStatus(snapshot.who.role, snapshot.counts)
    : null;

  const weekOf = snapshot?.weekOf ?? null;
  const planActive = mode === "monday_plan";

  return (
    <div className="max-w-4xl px-4 lg:px-8 py-6 lg:py-8 space-y-6">
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

      {/* ── WeekStatus ─────────────────────────────────────────────────────── */}
      <section className="rounded-card border-[1.5px] border-outline bg-surface p-6">
        {status ? (
          <WeekStatusLine status={status} />
        ) : (
          <p className="text-sm text-ink-2">
            Sign in to see this week&apos;s read.
          </p>
        )}
      </section>

      {/* ── The two doors ───────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Door
          href="/admin/ops/monday"
          eyebrow="Monday · Aim"
          title="Plan"
          blurb="Take the wheel. Clear the carryover, walk the areas and days, and place the week against the time you actually have."
          active={planActive}
        />
        <Door
          href="/admin/ops/friday"
          eyebrow="Friday · Account"
          title="Close"
          blurb="Put the week down. Truth the tasks, roll the remainder deliberately, and clear the meeting follow-ups before the weekend."
          active={!planActive}
        />
      </section>

      <p className="text-xs text-ink-3">
        {planActive
          ? "It's early in the week — Plan is lit. Close stays open whenever you need it."
          : "It's the back half of the week — Close is lit. Plan stays open whenever you need it."}
      </p>
    </div>
  );
}
