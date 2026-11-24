import Link from "next/link";
import { getSiteAdmin } from "@/lib/site/adminAuth";
import PageHeader from "@/app/admin/_components/PageHeader";
import StatCard from "@/app/admin/_components/StatCard";
import { getSiteSupabase } from "@/lib/site/supabase";
import { addDays, pacificToday, siteDailyStats } from "@/lib/site/stats";

// Games health, read-only: the first place to look when a teacher says a
// game broke. Plays per day, what each game has to draw from, and whether
// Never Heard of It has a job scheduled.

export const dynamic = "force-dynamic";

export default async function GamesPage() {
  // Every page checks sign-in itself. The layout's sign-in screen is not
  // enough: Next renders the page alongside it, so an unguarded page would
  // ship its data to a signed-out visitor.
  if (!(await getSiteAdmin())) return null;
  const db = getSiteSupabase();
  const today = pacificToday();
  const [days, pool, daily, cutOpen, msOpen] = await Promise.all([
    siteDailyStats(addDays(today, -13), today).catch(() => []),
    db.from("game_pool").select("higher_wage, daily, the_cut").eq("eligible", true),
    db.from("game_daily").select("day").eq("game", "nhoi").gte("day", today).order("day"),
    db.from("cut_rooms").select("id", { count: "exact", head: true }).gt("expires_at", new Date().toISOString()),
    db.from("ms_rooms").select("id", { count: "exact", head: true }).gt("expires_at", new Date().toISOString()),
  ]);

  const eligible = (pool.data ?? []) as { higher_wage: boolean; daily: boolean; the_cut: boolean }[];
  const upcoming = ((daily.data ?? []) as { day: string }[]).map((d) => d.day);
  const scheduledToday = upcoming[0] === today;

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8">
      <PageHeader title="Games" subtitle="Read-only health for the teen games, Pacific time." />

      {!scheduledToday && (
        <p className="mb-6 rounded-lg border border-orange/40 bg-orange-light px-4 py-3 text-sm text-orange-dark">
          Never Heard of It has no job scheduled today, so teens see “check back tomorrow.”{" "}
          <Link href="/admin/careers/daily" className="underline font-semibold">
            Schedule days
          </Link>
          .
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard label="Higher Wage pool" value={eligible.filter((p) => p.higher_wage).length} sub="eligible jobs" />
        <StatCard label="Never Heard of It" value={upcoming.length} sub={`days scheduled from today${upcoming.length ? `, through ${upcoming[upcoming.length - 1]}` : ""}`} />
        <StatCard label="The Cut pool" value={eligible.filter((p) => p.the_cut).length} sub={`${cutOpen.count ?? 0} rooms open now`} />
        <StatCard label="Built For rooms" value={msOpen.count ?? 0} sub="open now" />
      </div>

      <h2 className="font-heading font-semibold text-sm mb-3">Last 14 days</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-warm">
            <th className="py-2">Day</th>
            <th>Higher Wage</th>
            <th>Never Heard of It</th>
            <th>The Cut</th>
            <th>Built For finished</th>
            <th>Decks played</th>
            <th>Rooms</th>
          </tr>
        </thead>
        <tbody>
          {[...days].reverse().map((d) => (
            <tr key={d.day} className="border-t border-gray-light">
              <td className="py-2">{d.day}</td>
              <td>{d.higher_wage_players}</td>
              <td>{d.nhoi_players}</td>
              <td>{d.the_cut_players}</td>
              <td>{d.builtfor_completions}</td>
              <td>{d.decks_claimed}</td>
              <td>{d.rooms_run}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-gray-warm mt-3">The three quick games count unique visitors; they keep no play log.</p>
    </div>
  );
}
