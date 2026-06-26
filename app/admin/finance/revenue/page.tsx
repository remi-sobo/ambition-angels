import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { loadHubSpotPledges } from "@/lib/finance/hubspot-pledges";
import { loadRevenueSchedule } from "@/lib/finance/schedule";
import PledgesEditor, { type Pledge } from "./_components/PledgesEditor";
import RevenueSchedule from "./_components/RevenueSchedule";

type SearchParams = { year?: string };

export default async function RevenuePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = getSupabaseAdmin();

  const { data: cfg } = await supabase
    .from("fin_config")
    .select("current_year, fundraising_goal")
    .eq("id", 1)
    .maybeSingle();
  const configYear = typeof cfg?.current_year === "number" ? cfg.current_year : new Date().getFullYear();
  const requested = parseInt(searchParams.year ?? "", 10);
  const year =
    Number.isFinite(requested) && requested >= 2000 && requested <= 2100 ? requested : configYear;
  const goal = Number(cfg?.fundraising_goal ?? 0);

  const [pledgesRes, hubspotPledges, scheduleRows] = await Promise.all([
    supabase
      .from("fin_revenue_commitments")
      .select(
        "id, year, source_type, source_name, amount, status, expected_date, probability, restricted, restricted_to, notes, external_ref"
      )
      .eq("year", year)
      .order("status", { ascending: true })
      .order("amount", { ascending: false }),
    loadHubSpotPledges(supabase, year),
    // The canonical schedule for the read-only "feeds runway" panel. Scoped to
    // the requested year so it tracks the year picker.
    loadRevenueSchedule(supabase),
  ]);

  const scheduleForYear = scheduleRows.filter((r) => r.due_date.slice(0, 4) === String(year));

  const pledges = (pledgesRes.data ?? []).map((p) => ({
    ...p,
    amount: Number(p.amount ?? 0),
    probability: p.probability === null ? null : Number(p.probability),
  })) as Pledge[];

  const years = [year - 1, year, year + 1].filter((y) => y >= 2024 && y <= 2030);

  return (
    <div className="max-w-7xl px-4 lg:px-8 py-6 lg:py-8">
      <header className="mb-6 flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 text-xs text-ink-2 mb-1">
            <Link href="/admin/finance" className="hover:text-ink-1">
              ← Finance
            </Link>
          </div>
          <h1 className="font-display font-black uppercase tracking-tight text-ink-1 text-3xl sm:text-4xl leading-none">
            Revenue · {year}
          </h1>
          <p className="mt-2 text-sm text-ink-2 max-w-2xl">
            Pledges, grants in progress, and received gifts. Secured =
            signed/committed but not yet in the bank. Projected = pipeline,
            weighted by probability. Received = money landed (also recorded
            as a transaction).
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {years.map((y) => (
            <Link
              key={y}
              href={`/admin/finance/revenue?year=${y}`}
              className={`px-3 py-1 rounded-full border ${
                y === year
                  ? "border-orange/60 bg-orange/15 text-orange"
                  : "border-outline text-ink-2 hover:text-ink-1"
              }`}
            >
              {y}
            </Link>
          ))}
        </div>
      </header>

      <div className="mb-8">
        <RevenueSchedule rows={scheduleForYear} />
      </div>

      <PledgesEditor
        year={year}
        initialPledges={pledges}
        fundraisingGoal={goal}
        hubspotPledges={hubspotPledges}
      />
    </div>
  );
}
