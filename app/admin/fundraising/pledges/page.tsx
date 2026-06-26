import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { money } from "../../finance/_components/charts";
import PageHeader from "../../_components/PageHeader";
import StatCard from "../../_components/StatCard";
import { constituentName } from "@/lib/fundraising/display";
import { todayISO } from "../../ops/_types/ops";
import { NewPledgeForm, ConvertOpportunityForm, type WonOpportunity } from "./_components/PledgeControls";

// Epic F — pledges list: outstanding balances, overdue installments, status.
export const dynamic = "force-dynamic";

type DbPledge = {
  id: string;
  total_amount: number;
  installment_count: number;
  frequency: string;
  status: string;
  start_date: string;
  constituent: { type: string; first_name: string | null; last_name: string | null; org_name: string | null } | null;
};
type DbPayment = { pledge_id: string; expected_amount: number; status: string; due_date: string };

export default async function PledgesPage() {
  const supabase = createServerSupabase();
  const [pledgesRes, paymentsRes, campaignsRes, fundsRes, wonRes] = await Promise.all([
    supabase
      .from("pledges")
      .select("id, total_amount, installment_count, frequency, status, start_date, constituent:constituents ( type, first_name, last_name, org_name )")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("pledge_payments").select("pledge_id, expected_amount, status, due_date").limit(10000),
    supabase.from("campaigns").select("id, name").order("name"),
    supabase.from("funds").select("id, name").order("name"),
    // Won asks (steward stage) with a real amount + donor — convertible into a
    // dated pledge schedule that feeds runway.
    supabase
      .from("opportunities")
      .select("id, name, ask_amount, constituent:constituents ( id, type, first_name, last_name, org_name )")
      .eq("stage", "steward")
      .gt("ask_amount", 0)
      .order("ask_amount", { ascending: false })
      .limit(50),
  ]);

  if (pledgesRes.error) {
    return (
      <div className="min-h-screen bg-ink p-6 lg:p-10">
        <h1 className="font-heading font-bold text-ink-1 text-2xl mb-4">Pledges</h1>
        <div className="bg-tile shadow-tile border border-orange/30 rounded-card-lg p-6 max-w-xl text-sm text-ink-2 leading-relaxed">
          The pledges tables aren&apos;t in this database yet. Apply{" "}
          <code className="text-orange">create_pledges.sql</code>, then reload.
        </div>
      </div>
    );
  }

  const pledges = (pledgesRes.data ?? []) as unknown as DbPledge[];
  const payments = (paymentsRes.data ?? []) as DbPayment[];
  const campaigns = (campaignsRes.data ?? []) as Array<{ id: string; name: string }>;
  const funds = (fundsRes.data ?? []) as Array<{ id: string; name: string }>;
  const today = todayISO();

  const agg = new Map<string, { paid: number; overdue: number; nextDue: string | null }>();
  for (const p of payments) {
    const a = agg.get(p.pledge_id) ?? { paid: 0, overdue: 0, nextDue: null };
    if (p.status === "paid") a.paid += Number(p.expected_amount);
    if (p.status === "scheduled") {
      if (p.due_date < today) a.overdue += 1;
      if (!a.nextDue || p.due_date < a.nextDue) a.nextDue = p.due_date;
    }
    agg.set(p.pledge_id, a);
  }

  const rows = pledges.map((p) => {
    const a = agg.get(p.id) ?? { paid: 0, overdue: 0, nextDue: null };
    return { p, paid: a.paid, balance: Math.max(0, Number(p.total_amount) - a.paid), overdue: a.overdue, nextDue: a.nextDue };
  });

  const activeRows = rows.filter((r) => r.p.status === "active");
  const outstanding = activeRows.reduce((s, r) => s + r.balance, 0);
  const overdueCount = rows.reduce((s, r) => s + r.overdue, 0);

  // Committed inflow still scheduled (scheduled + overdue installments) — the
  // slice of these pledges that lands in v_revenue_schedule and feeds runway.
  const scheduledInflow = payments
    .filter((p) => p.status === "scheduled")
    .reduce((s, p) => s + Number(p.expected_amount), 0);

  const wonOpps: WonOpportunity[] = (
    (wonRes.data ?? []) as unknown as Array<{
      id: string;
      name: string | null;
      ask_amount: number;
      constituent: { id: string; type: string; first_name: string | null; last_name: string | null; org_name: string | null } | null;
    }>
  )
    .filter((o) => o.constituent)
    .map((o) => ({
      id: o.id,
      label: o.name || (o.constituent ? constituentName(o.constituent) : "Won ask"),
      askAmount: Number(o.ask_amount),
      constituentId: o.constituent!.id,
    }));

  return (
    <div className="min-h-screen bg-ink">
      <div className="max-w-[1400px] px-4 lg:px-8 py-6 lg:py-8 space-y-6">
        <PageHeader
          title="Pledges"
          subtitle={`${activeRows.length} active · ${pledges.length} total`}
        />

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 flex-1 min-w-[18rem]">
            <StatCard label="Outstanding" value={money(outstanding)} sub="balance on active pledges" />
            <StatCard label="Active pledges" value={activeRows.length} />
            <StatCard label="Overdue installments" value={overdueCount} sub={overdueCount > 0 ? "past due" : "all current"} muted={overdueCount === 0} />
            <StatCard label="Scheduled inflow" value={money(scheduledInflow)} sub="feeds runway via the revenue schedule" />
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <ConvertOpportunityForm opportunities={wonOpps} />
              <NewPledgeForm campaigns={campaigns} funds={funds} />
            </div>
            <Link href="/admin/finance/revenue" className="text-[11px] text-ink-3 hover:text-orange transition-colors">
              See the full revenue schedule →
            </Link>
          </div>
        </div>

        <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
          {rows.length === 0 ? (
            <p className="p-8 text-ink-2 text-sm">
              No pledges yet. Create one to track a multi-installment commitment; installments
              become real gifts as they&apos;re paid.
            </p>
          ) : (
            <ul className="divide-y divide-hairline">
              {rows.map(({ p, paid, balance, overdue, nextDue }) => (
                <li key={p.id}>
                  <Link href={`/admin/fundraising/pledges/${p.id}`} className="px-5 py-3 flex items-center gap-4 hover:bg-[#EFE6D4] transition-colors">
                    <span className="text-sm font-medium text-ink-1 flex-1 truncate">
                      {p.constituent ? constituentName(p.constituent) : "Unknown"}
                    </span>
                    {overdue > 0 && p.status === "active" && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-expense-bg text-expense">{overdue} overdue</span>
                    )}
                    <span className="text-[10px] uppercase tracking-wider text-ink-3 w-20">{p.status}</span>
                    <span className="text-xs text-ink-2 w-28 [font-variant-numeric:tabular-nums]">
                      {nextDue && p.status === "active" ? `next ${nextDue}` : ""}
                    </span>
                    <span className="text-xs text-ink-2 w-32 text-right [font-variant-numeric:tabular-nums]">
                      {money(paid)} / {money(Number(p.total_amount))}
                    </span>
                    <span className="font-bold text-ink-1 w-24 text-right [font-variant-numeric:tabular-nums]">{money(balance)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
