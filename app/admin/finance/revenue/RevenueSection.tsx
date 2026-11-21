import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { loadRevenueSchedule } from "@/lib/finance/schedule";
import { constituentName } from "@/lib/fundraising/display";
import RevenueManager, { type Commitment, type ReceivedGift } from "./_components/RevenueManager";
import SegmentedControl from "../../_components/ui/SegmentedControl";
import PageHeader from "../../_components/PageHeader";
import { TYPE } from "@/lib/admin/typeScale";
import { requirePagePermission } from "@/app/admin/_components/PermissionGate";

type SearchParams = { year?: string };

// Extracted at Spec Finance N2: the V1 route renders it standalone
// (embedded=false — output byte-identical to the pre-N2 page) and Forecast
// embeds it as the year's received / committed / projected tiers. basePath
// keeps the year pills pointed at whichever route hosts it.
export default async function RevenueSection({
  searchParams,
  embedded = false,
  basePath = "/admin/finance/revenue",
}: {
  searchParams: SearchParams;
  embedded?: boolean;
  basePath?: string;
}) {
  const roleGate = await requirePagePermission("finance.read", "Finance");
  if (!roleGate.ok) return embedded ? null : roleGate.page;
  const supabase = getSupabaseAdmin();

  // Org fence: the service-role client bypasses RLS, so every read below is
  // scoped to the active org. No session → nothing to show.
  const ctx = await getOrgContext();
  if (!ctx) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8">
        <PageHeader title="Revenue" subtitle="Sign in to view revenue." />
      </div>
    );
  }
  const orgId = ctx.orgId;
  const { data: cfg } = await supabase
    .from("fin_config")
    .select("current_year, fundraising_goal")
    .eq("org_id", orgId)
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
      .eq("org_id", orgId)
      .eq("year", year)
      .order("status", { ascending: true })
      .order("amount", { ascending: false }),
    loadRevenueSchedule(supabase, orgId),
    // Received gifts for the year (the canonical landed-money ledger), donor-named.
    supabase
      .from("gifts")
      .select("id, amount, gift_date, constituent:constituents ( type, first_name, last_name, org_name )")
      .eq("org_id", orgId)
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

  const yearPills = (
    <SegmentedControl
      label="Revenue year"
      segments={years.map((y) => ({ value: String(y), label: String(y) }))}
      value={String(year)}
      hrefFor={(y) => `${basePath}?year=${y}`}
    />
  );

  return (
    <div className={embedded ? undefined : "px-4 lg:px-8 py-6 lg:py-8 max-w-workspace"}>
      {embedded ? (
        <div className="flex items-center gap-3 flex-wrap mb-3">
          <div>
            <h2 className={TYPE.sectionTitle}>Revenue {year}</h2>
            <p className={`${TYPE.bodyMuted} mt-1 max-w-reading`}>
              Received is money landed. Committed is signed but not yet in the bank. Projected is pipeline, weighted by its
              chance of closing.
            </p>
          </div>
          <div className="ml-auto">{yearPills}</div>
        </div>
      ) : (
        <PageHeader
          breadcrumb={[{ label: "Finance", href: "/admin/finance/snapshot" }]}
          title={`Revenue ${year}`}
          subtitle="What has come in and what is still expected this year. Committed is signed but not yet in the bank. Projected is pipeline, weighted by its chance of closing. Received is money landed."
          secondaryActions={yearPills}
        />
      )}

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
