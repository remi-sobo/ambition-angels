import Link from "next/link";
import { getSiteAdmin } from "@/lib/site/adminAuth";
import PageHeader from "@/app/admin/_components/PageHeader";
import StatCard from "@/app/admin/_components/StatCard";
import { addDays, pacificToday, siteDailyStats, sumDays } from "@/lib/site/stats";

// Website admin home: the website's numbers at a glance. The same figures
// BloomOS receives for Ambition Angels' metrics (site_daily_stats), so the
// two always agree.

export const dynamic = "force-dynamic";

export default async function SiteAdminHome() {
  // Every page checks sign-in itself. The layout's sign-in screen is not
  // enough: Next renders the page alongside it, so an unguarded page would
  // ship its data to a signed-out visitor.
  if (!(await getSiteAdmin())) return null;
  const today = pacificToday();
  const days = await siteDailyStats(addDays(today, -27), today).catch(() => null);

  if (!days) {
    return (
      <div className="px-4 lg:px-8 py-8">
        <PageHeader title="Website admin" subtitle="Couldn't load the website numbers just now." />
      </div>
    );
  }

  const week = sumDays(days.slice(-7));
  const prior = sumDays(days.slice(-14, -7));
  const delta = (a: number, b: number) => (b === 0 ? undefined : `${a >= b ? "+" : ""}${Math.round(((a - b) / b) * 100)}% vs prior week`);
  const weeks = [0, 1, 2, 3].map((i) => {
    const slice = days.slice(days.length - 7 * (i + 1), days.length - 7 * i);
    return { start: slice[0]?.day, ...sumDays(slice) };
  }).reverse();

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8">
      <PageHeader title="Website admin" subtitle="Last 7 days, Pacific time. Everything about people, money and programs is in BloomOS." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard label="Visitors" value={week.unique_visitors} sub={delta(week.unique_visitors, prior.unique_visitors)} />
        <StatCard label="Page views" value={week.page_views} sub={delta(week.page_views, prior.page_views)} />
        <StatCard label="Built For finished" value={week.builtfor_completions} sub={`${week.decks_claimed} decks played`} />
        <StatCard label="Rooms run" value={week.rooms_run} sub="Built For + The Cut" />
        <StatCard label="Higher Wage" value={week.higher_wage_players} sub="unique visitors" />
        <StatCard label="Never Heard of It" value={week.nhoi_players} sub="unique visitors" />
        <StatCard label="The Cut" value={week.the_cut_players} sub="unique visitors" />
      </div>

      <h2 className="font-heading font-semibold text-sm mb-3">Page views by week</h2>
      <table className="w-full text-sm mb-8">
        <thead>
          <tr className="text-left text-xs text-gray-warm">
            <th className="py-2">Week of</th>
            <th>Page views</th>
            <th>Visitors</th>
            <th>Built For</th>
            <th>Rooms</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.start} className="border-t border-gray-light">
              <td className="py-2">{w.start}</td>
              <td>{w.page_views}</td>
              <td>{w.unique_visitors}</td>
              <td>{w.builtfor_completions}</td>
              <td>{w.rooms_run}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-xs text-gray-warm">
        Higher Wage, Never Heard of It and The Cut keep no play log (no student data, by design), so they count
        unique visitors to each game. More detail in <Link href="/admin/games" className="underline">Games</Link> and{" "}
        <Link href="/admin/analytics" className="underline">Analytics</Link>.
      </p>
    </div>
  );
}
