import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getFinanceSnapshot } from "@/lib/admin/finance";
import { loadHubSpotPledges } from "@/lib/finance/hubspot-pledges";
import { assembleRunwayPledges, endOfMonthISO, type RunwayPledge } from "@/lib/finance/runway";
import CloseWizard from "./_components/CloseWizard";

// The Friday close. A guided, sequenced sweep that gets cash, transactions,
// categories, pledges, balance, and baseline all current at once, then stamps
// "reconciled as of <date>". Lives at /close (the /reconcile route is the Cowork
// proposal inbox). The wizard invents no math — it sequences the inputs the
// dashboard already reads and surfaces freshness so "live" means visibly current.
export const dynamic = "force-dynamic";

export default async function FinanceClosePage() {
  const supabase = getSupabaseAdmin();
  const snap = await getFinanceSnapshot();
  const cfg = snap.cfg;

  const [lastImportRes, lastSyncRes, uncatRes, pledgesRes, hubspotPledges] = await Promise.all([
    supabase.from("fin_imports").select("uploaded_at").order("uploaded_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("hs_deals").select("synced_at").order("synced_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("fin_transactions").select("id", { count: "exact", head: true }).is("category_id", null),
    supabase
      .from("fin_revenue_commitments")
      .select("amount, status, expected_date, restricted, external_ref")
      .eq("year", cfg.year),
    loadHubSpotPledges(supabase, cfg.year),
  ]);

  // Unreceived pledges (deduped against adopted deals) for the review tiers.
  const bloom: RunwayPledge[] = (pledgesRes.data ?? [])
    .filter((r) => r.status !== "received")
    .map((r) => ({
      amount: Number(r.amount),
      status: r.status as RunwayPledge["status"],
      expected_date: (r.expected_date as string | null) ?? null,
      restricted: Boolean(r.restricted),
      externalRef: (r.external_ref as string | null) ?? null,
    }));
  const adoptedRefs = new Set(
    (pledgesRes.data ?? []).map((r) => r.external_ref as string | null).filter((r): r is string => !!r)
  );
  const hs: RunwayPledge[] = hubspotPledges
    .filter((d) => d.status !== "received")
    .map((d) => ({
      amount: d.amount,
      status: d.status as RunwayPledge["status"],
      expected_date: d.close_date,
      restricted: false,
      externalRef: d.deal_id,
    }));
  const runwayPledges = assembleRunwayPledges(bloom, hs, adoptedRefs);

  const now = new Date();
  const horizonEnds = {
    3: endOfMonthISO(now, 3),
    6: endOfMonthISO(now, 6),
    12: endOfMonthISO(now, 12),
  } as const;
  const ri = snap.runway.inputs;

  return (
    <div className="max-w-4xl px-4 lg:px-8 py-6 lg:py-8">
      <header className="mb-6">
        <div className="flex items-center gap-3 text-xs text-ink-2 mb-1">
          <Link href="/admin/finance" className="hover:text-ink-1">← Finance</Link>
        </div>
        <h1 className="font-display font-black uppercase tracking-tight text-ink-1 text-3xl sm:text-4xl leading-none">
          Friday close
        </h1>
        <p className="mt-2 text-sm text-ink-2 max-w-2xl">
          Work top to bottom: import the week&apos;s bank CSV, clear uncategorized, sync and confirm
          pledges, set the balance, confirm the burn baseline, then review the three runway tiers and
          stamp the close. Monday starts on numbers everyone trusts.
        </p>
      </header>

      <CloseWizard
        lastImportAt={lastImportRes.data?.uploaded_at ?? null}
        lastSyncAt={lastSyncRes.data?.synced_at ?? null}
        lastBalanceAt={cfg.reconciledAt}
        lastClosedAt={cfg.lastReconciledAt}
        uncategorizedCount={uncatRes.count ?? 0}
        cashOnHand={snap.cashOnHand}
        anchorDate={cfg.startDate}
        baseline={cfg.baseline}
        burn3mo={snap.burn3mo}
        runwayInputs={{
          baseline: ri.baseline,
          baselineSource: ri.baselineSource,
          bankBalance: ri.bankBalance,
          mtdSpend: ri.mtdSpend,
        }}
        endCurrentMonth={endOfMonthISO(now, 0)}
        horizonEnds={horizonEnds}
        defaultHorizon={cfg.horizon}
        runwayPledges={runwayPledges}
      />
    </div>
  );
}
