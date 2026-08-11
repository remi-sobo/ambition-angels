import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { laDateString } from "@/lib/games/guess";
import PageHeader from "../../_components/PageHeader";
import StatCard from "../../_components/StatCard";
import { DailyControls, type DailyCandidate, type DailyRow } from "./_components/DailyControls";

// The daily calendar (specs/teen-games-v1.md Phase 4): Never Heard of It
// is pre-scheduled here, at least thirty days ahead, by a human. Nothing
// about the daily is random at runtime — whatever is on this calendar is
// what every teen in every timezone gets that day (days roll at midnight
// Pacific). Schedulable = pool-eligible for the daily AND approved card.
export const dynamic = "force-dynamic";

const HORIZON_DAYS = 45;

export default async function DailyPage() {
  const supabase = getSupabaseAdmin();
  const today = laDateString();
  const horizon = new Date(Date.parse(today) + HORIZON_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const [{ data: pool }, { data: cards }, { data: scheduled }] = await Promise.all([
    supabase.from("game_pool").select("soc_code").eq("eligible", true).eq("daily", true),
    supabase.from("ms_cards").select("soc_code").eq("status", "approved"),
    supabase
      .from("game_daily")
      .select("day, soc_code")
      .eq("game", "nhoi")
      .gte("day", today)
      .lte("day", horizon)
      .order("day"),
  ]);

  const approvedSocs = new Set((cards ?? []).map((c) => c.soc_code));
  const schedulableSocs = (pool ?? [])
    .map((p) => p.soc_code)
    .filter((soc) => approvedSocs.has(soc));

  const { data: occs } = schedulableSocs.length
    ? await supabase
        .from("ms_occupations")
        .select("soc_code, title, job_zone")
        .in("soc_code", schedulableSocs)
        .order("title")
    : { data: [] };

  const candidates = (occs ?? []) as DailyCandidate[];
  const rows = (scheduled ?? []).map((s) => ({ day: String(s.day), soc_code: s.soc_code })) as DailyRow[];
  const scheduledDays = rows.length;

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1100px]">
      <PageHeader
        title="Daily Calendar"
        subtitle="Never Heard of It · one job a day, scheduled by you, rolls at midnight Pacific"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-2">
        <StatCard
          label="Schedulable"
          value={candidates.length}
          sub="in the pool + approved card"
          muted={candidates.length === 0}
        />
        <StatCard
          label="Scheduled"
          value={scheduledDays}
          sub={`of the next ${HORIZON_DAYS} days`}
          muted={scheduledDays === 0}
        />
        <StatCard
          label="Runway"
          value={runwayDays(rows, today)}
          sub="consecutive days covered from today"
          muted={runwayDays(rows, today) === 0}
        />
        <StatCard label="Weekly rule" value="3 of 7" sub="job zone ≤ 3 — enforced on save" muted />
      </div>

      <p className="text-[12px] text-ink-2 mb-6">
        Short on candidates? Approve occupations for the daily in the{" "}
        <Link href="/admin/careers/pool" className="underline underline-offset-2">
          Play Pool
        </Link>{" "}
        and write their cards in the{" "}
        <Link href="/admin/careers" className="underline underline-offset-2">
          Career Library
        </Link>
        .
      </p>

      {candidates.length === 0 ? (
        <div className="bg-surface shadow-panel border-[1.5px] border-outline rounded-xl px-4 py-6 text-sm text-ink-2">
          <p className="font-semibold text-ink-1 mb-1">Nothing schedulable yet.</p>
          <p>
            A daily job needs both gates: eligible in the Play Pool (with the Daily flag on) and an
            approved card in the Career Library.
          </p>
        </div>
      ) : (
        <DailyControls today={today} horizonDays={HORIZON_DAYS} candidates={candidates} scheduled={rows} />
      )}
    </div>
  );
}

function runwayDays(rows: { day: string }[], today: string): number {
  const have = new Set(rows.map((r) => r.day));
  let n = 0;
  for (;;) {
    const d = new Date(Date.parse(today) + n * 86_400_000).toISOString().slice(0, 10);
    if (!have.has(d)) return n;
    n++;
  }
}
