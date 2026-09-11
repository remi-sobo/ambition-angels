import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getFinanceSnapshot } from "@/lib/admin/finance";
import { endOfMonthISO } from "@/lib/finance/runway";
import { loadRevenueSchedule, scheduleToRunwayPledges } from "@/lib/finance/schedule";
import CloseWizard from "./_components/CloseWizard";
import PageHeader from "../../_components/PageHeader";
import { TYPE } from "@/lib/admin/typeScale";

// The Friday close. A guided, sequenced sweep that gets cash, transactions,
// categories, pledges, balance, and baseline all current at once, then stamps
// "reconciled as of <date>". The wizard invents no math — it sequences the
// inputs the dashboard already reads and surfaces freshness so "live" means
// visibly current.
//
// Extracted at Spec Finance N1: the V1 route renders it standalone
// (embedded=false — output byte-identical to the pre-N1 page) and
// Finance → Transactions embeds it below the reconcile inbox. The close
// stamp is Contract-7 gated as of N1: pending reconciliation items block it
// unless a reports.approve holder waives (export_waivers + audit_log).

export default async function CloseSection({ embedded = false }: { embedded?: boolean }) {
  const supabase = getSupabaseAdmin();
  const snap = await getFinanceSnapshot();
  const cfg = snap.cfg;
  // Org fence: service-role client bypasses RLS; scope to the snapshot's org.
  const orgId = snap.orgId;

  const [lastImportRes, lastSyncRes, uncatRes, scheduleRows] = await Promise.all([
    supabase.from("fin_imports").select("uploaded_at").eq("org_id", orgId).order("uploaded_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("hs_deals").select("synced_at").eq("org_id", orgId).order("synced_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("fin_transactions").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("category_id", null),
    loadRevenueSchedule(supabase, orgId),
  ]);

  // Review tiers read the canonical schedule: committed at full value, open
  // pipeline weighted, restricted carved out by summarizePledges. (The hs_deals
  // sync timestamp above is still surfaced as freshness; the runway no longer
  // reads hs_deals for its numbers.)
  const runwayPledges = scheduleToRunwayPledges(scheduleRows);

  const now = new Date();
  const horizonEnds = {
    3: endOfMonthISO(now, 3),
    6: endOfMonthISO(now, 6),
    12: endOfMonthISO(now, 12),
  } as const;
  const ri = snap.runway.inputs;

  const wizard = (
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
  );

  if (embedded) {
    return (
      <section className="mt-8 max-w-4xl">
        <div className="mb-3">
          <h2 className={TYPE.cardTitle}>Friday close</h2>
          <p className="text-[11px] text-ink-3 max-w-2xl">
            Work top to bottom, then stamp the close. The stamp blocks while reconcile
            proposals are pending above. A reports.approve holder can waive, on the record.
          </p>
        </div>
        {wizard}
      </section>
    );
  }

  return (
    <div className="max-w-4xl px-4 lg:px-8 py-6 lg:py-8">
      <header>
        <div className="flex items-center gap-3 text-xs text-ink-2 mb-1">
          <Link href="/admin/finance" className="hover:text-ink-1">← Finance</Link>
        </div>
        <PageHeader
          title="Friday close"
          subtitle={
            <span className="block max-w-2xl">
              Work top to bottom: import the week&apos;s bank CSV, clear uncategorized, sync and confirm
              pledges, set the balance, confirm the burn baseline, then review the three runway tiers and
              stamp the close. Monday starts on numbers everyone trusts.
            </span>
          }
        />
      </header>

      {wizard}
    </div>
  );
}
