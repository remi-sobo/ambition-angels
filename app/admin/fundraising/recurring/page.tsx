import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { money } from "../../finance/_components/charts";
import PageHeader from "../../_components/PageHeader";
import StatCard from "../../_components/StatCard";
import { constituentName } from "@/lib/fundraising/display";
import { NewRecurringForm, RecurringActions } from "./_components/RecurringControls";
import { TYPE } from "@/lib/admin/typeScale";

// Epic G — recurring giving: active plans, monthly run-rate, failed-payment
// follow-up, and manual plan management.
export const dynamic = "force-dynamic";

type Plan = {
  id: string;
  amount: number;
  frequency: string;
  status: string;
  external_source: string | null;
  last_charged_at: string | null;
  last_payment_failed_at: string | null;
  constituent: { id: string; type: string; first_name: string | null; last_name: string | null; org_name: string | null } | null;
};

// Normalize any cadence to a monthly figure for the run-rate.
function monthly(amount: number, freq: string): number {
  if (freq === "annually") return amount / 12;
  if (freq === "quarterly") return amount / 3;
  if (freq === "weekly") return (amount * 52) / 12;
  return amount;
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function RecurringPage() {
  // Pinned to the ACTIVE org — RLS alone would merge rows from every org the
  // user belongs to.
  const ctx = await getOrgContext();
  if (!ctx) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8">
        <PageHeader title="Recurring" subtitle="Sign in to view recurring plans." />
      </div>
    );
  }
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("recurring_plans")
    .select("id, amount, frequency, status, external_source, last_charged_at, last_payment_failed_at, constituent:constituents ( id, type, first_name, last_name, org_name )")
    .eq("org_id", ctx.orgId)
    .order("status")
    .order("amount", { ascending: false })
    .limit(1000);

  if (error) {
    return (
      <div className="min-h-screen bg-ink p-6 lg:p-10">
        <h1 className={`${TYPE.pageTitle} mb-4`}>Recurring</h1>
        <div className="bg-tile shadow-tile border border-orange/30 rounded-card-lg p-6 max-w-xl text-sm text-ink-2 leading-relaxed">
          The fundraising tables aren&apos;t in this database yet, or{" "}
          <code className="text-orange">add_recurring_plan_health.sql</code> hasn&apos;t been applied. Apply it, then reload.
        </div>
      </div>
    );
  }

  const plans = (data ?? []) as unknown as Plan[];
  const active = plans.filter((p) => p.status === "active");
  const mrr = active.reduce((s, p) => s + monthly(Number(p.amount), p.frequency), 0);
  const failed = active.filter((p) => p.last_payment_failed_at);

  const statusRank = (s: string) => (s === "active" ? 0 : s === "paused" ? 1 : 2);
  const sorted = [...plans].sort((a, b) => statusRank(a.status) - statusRank(b.status) || Number(b.amount) - Number(a.amount));

  return (
    <div className="min-h-screen bg-ink">
      <div className="max-w-[1400px] px-4 lg:px-8 py-6 lg:py-8 space-y-6">
        <PageHeader title="Recurring" subtitle={`${active.length} active plan${active.length === 1 ? "" : "s"}`} />

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 flex-1 min-w-[18rem]">
            <StatCard label="Monthly run-rate" value={money(mrr)} sub="normalized to monthly" />
            <StatCard label="Active plans" value={active.length} />
            <StatCard label="Payment failures" value={failed.length} sub={failed.length > 0 ? "need follow-up" : "all healthy"} muted={failed.length === 0} />
          </div>
          <NewRecurringForm />
        </div>

        <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
          {sorted.length === 0 ? (
            <p className={`p-8 ${TYPE.bodyMuted}`}>
              No recurring plans yet. Stripe monthly donations create plans automatically; use
              &ldquo;Manual plan&rdquo; for offline standing gifts.
            </p>
          ) : (
            <ul className="divide-y divide-hairline">
              {sorted.map((p) => {
                const donor = p.constituent ? constituentName(p.constituent) : "Unknown";
                return (
                  <li key={p.id} className="px-5 py-3 flex items-center gap-4">
                    <span className="text-sm font-medium text-ink-1 flex-1 truncate">
                      {p.constituent ? (
                        <Link href={`/admin/fundraising/donors/${p.constituent.id}`} className="hover:text-orange transition-colors">{donor}</Link>
                      ) : donor}
                    </span>
                    {p.last_payment_failed_at && p.status === "active" && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-expense-bg text-expense">payment failed</span>
                    )}
                    {p.external_source === "manual" && (
                      <span className="text-[10px] uppercase tracking-wider text-ink-3">manual</span>
                    )}
                    <span className="text-[10px] uppercase tracking-wider text-ink-3 w-16">{p.status}</span>
                    <span className="text-xs text-ink-2 w-28 [font-variant-numeric:tabular-nums]">
                      {p.last_charged_at ? `last ${fmtDate(p.last_charged_at)}` : ""}
                    </span>
                    <span className="font-bold text-ink-1 w-28 text-right [font-variant-numeric:tabular-nums]">
                      {money(Number(p.amount))}<span className="text-ink-3 font-normal">/{p.frequency.slice(0, 2)}</span>
                    </span>
                    <span className="w-40 text-right">
                      <RecurringActions id={p.id} status={p.status} />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
