import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { loadRevenueSchedule } from "@/lib/finance/schedule";
import { constituentName } from "@/lib/fundraising/display";
import RevenueManager, { type Commitment, type ReceivedGift } from "./_components/RevenueManager";

type SearchParams = { year?: string };

export const dynamic = "force-dynamic";

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
  const yStart = `${year}-01-01`;
  const yEnd = `${year}-12-31`;

  const [commitmentsRes, scheduleRows, giftsRes] = await Promise.all([
    supabase
      .from("fin_revenue_commitments")
      .select(
        "id, year, source_type, source_name, amount, status, expected_date, probability, restricted, restricted_to, notes"
      )
      .eq("year", year)
      .order("status", { ascending: true })
      .order("amount", { ascending: false }),
    loadRevenueSchedule(supabase),
    // Received gifts for the year (the canonical landed-money ledger), donor-named.
    supabase
      .from("gifts")
      .select("id, amount, gift_date, constituent:constituents ( type, first_name, last_name, org_name )")
      .gte("gift_date", yStart)
      .lte("gift_date", yEnd)
      .order("gift_date", { ascending: false })
      .limit(500),
  ]);

  const scheduleForYear = scheduleRows.filter((r) => r.due_date.slice(0, 4) === String(year));

  const commitments = (commitmentsRes.data ?? []).map((c) => ({
    ...c,
    amount: Number(c.amount ?? 0),
    probability: c.probability === null ? null : Number(c.probability),
  })) as Commitment[];

  const giftRows = (giftsRes.data ?? []) as unknown as Array<{
    id: string;
    amount: number;
    gift_date: string;
    constituent: { type: string; first_name: string | null; last_name: string | null; org_name: string | null } | null;
  }>;
  const receivedGifts: ReceivedGift[] = giftRows.map((g) => ({
    id: g.id,
    label: g.constituent ? constituentName(g.constituent) : "Gift",
    date: g.gift_date,
    amount: Number(g.amount),
  }));
  const receivedGiftsTotal = receivedGifts.reduce((s, g) => s + g.amount, 0);

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
            What&apos;s come in and what&apos;s still expected this year. Committed = signed but not yet
            in the bank. Projected = pipeline, weighted by probability. Received = money landed.
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

      <RevenueManager
        year={year}
        goal={goal}
        scheduleRows={scheduleForYear}
        commitments={commitments}
        receivedGifts={receivedGifts}
        receivedGiftsTotal={receivedGiftsTotal}
      />
    </div>
  );
}
