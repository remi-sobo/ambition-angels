import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { money } from "../../../finance/_components/charts";
import StatCard from "../../../_components/StatCard";
import PageHeader from "../../../_components/PageHeader";
import { constituentName } from "@/lib/fundraising/display";
import { todayISO } from "../../../ops/_types/ops";
import { PledgeStatusSelect, PaymentActions } from "../_components/PledgeControls";
import { TYPE } from "@/lib/admin/typeScale";

export const dynamic = "force-dynamic";

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

type Payment = {
  id: string; due_date: string; expected_amount: number; status: string;
  gift_id: string | null; paid_at: string | null;
};

export default async function PledgeDetailPage({ params }: { params: { id: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const supabase = createServerSupabase();

  const [pRes, paymentsRes] = await Promise.all([
    supabase
      .from("pledges")
      .select("*, constituent:constituents ( id, type, first_name, last_name, org_name ), campaign:campaigns ( name ), fund:funds ( name )")
      .eq("id", params.id)
      .maybeSingle(),
    supabase
      .from("pledge_payments")
      .select("id, due_date, expected_amount, status, gift_id, paid_at")
      .eq("pledge_id", params.id)
      .order("due_date", { ascending: true }),
  ]);

  if (pRes.error) {
    return (
      <div className="min-h-screen bg-ink p-6 lg:p-10">
        <h1 className={`${TYPE.pageTitle} mb-4`}>Pledges</h1>
        <div className="bg-tile shadow-tile border border-orange/30 rounded-card-lg p-6 max-w-xl text-sm text-ink-2 leading-relaxed">
          The pledges tables aren&apos;t in this database yet. Apply{" "}
          <code className="text-orange">create_pledges.sql</code>, then reload.
        </div>
      </div>
    );
  }
  if (!pRes.data) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = pRes.data as any;
  const constituent = (Array.isArray(p.constituent) ? p.constituent[0] : p.constituent) ?? null;
  const campaign = (Array.isArray(p.campaign) ? p.campaign[0] : p.campaign) ?? null;
  const fund = (Array.isArray(p.fund) ? p.fund[0] : p.fund) ?? null;
  const payments = (paymentsRes.data ?? []) as Payment[];
  const today = todayISO();

  const total = Number(p.total_amount);
  const paid = payments.filter((x) => x.status === "paid").reduce((s, x) => s + Number(x.expected_amount), 0);
  const balance = Math.max(0, total - paid);
  const donorName = constituent ? constituentName(constituent) : "Unknown";

  const facts: Array<[string, string]> = [
    ["Donor", donorName],
    ["Total", money(total)],
    ["Schedule", `${p.installment_count} × ${p.frequency}`],
    ["First due", fmtDate(p.start_date)],
    ["Campaign", campaign?.name ?? "—"],
    ["Fund", fund?.name ?? "—"],
  ];

  return (
    <div className="min-h-screen bg-ink">
      <div className="max-w-[1100px] px-4 lg:px-8 py-6 lg:py-8 space-y-6">
        <PageHeader
          eyebrow={<Link href="/admin/fundraising/pledges" className="hover:text-ink-1 transition-colors">← Pledges</Link>}
          title={
            <span className="flex items-center gap-3 flex-wrap">
              <span className="truncate">{donorName}</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange/15 text-orange uppercase tracking-wider">{p.status}</span>
            </span>
          }
          actions={<PledgeStatusSelect pledgeId={p.id} status={p.status} />}
        />

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard label="Pledged" value={money(total)} />
          <StatCard label="Paid" value={money(paid)} sub={`${payments.filter((x) => x.status === "paid").length} of ${payments.length} installments`} />
          <StatCard label="Balance" value={money(balance)} muted={balance === 0} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <section className="lg:col-span-4 bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-5 space-y-3">
            <h2 className={`${TYPE.cardTitle} mb-1`}>Pledge</h2>
            {facts.map(([label, value]) => (
              <div key={label} className="flex gap-3 text-xs">
                <span className="text-ink-3 w-20 flex-shrink-0 uppercase tracking-wider font-semibold pt-px">{label}</span>
                <span className="text-ink-1 break-words min-w-0">{value}</span>
              </div>
            ))}
            {p.notes && <p className="text-xs text-ink-2 border-t border-outline pt-3">{p.notes}</p>}
          </section>

          <section className="lg:col-span-8 bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-outline">
              <h2 className={TYPE.cardTitle}>Installments</h2>
            </div>
            {payments.length === 0 ? (
              <p className="p-6 text-ink-2 text-sm">No installments scheduled.</p>
            ) : (
              <ul className="divide-y divide-hairline">
                {payments.map((x) => {
                  const overdue = x.status === "scheduled" && x.due_date < today;
                  return (
                    <li key={x.id} className="px-5 py-3 flex items-center gap-4">
                      <span className={`text-xs w-24 flex-shrink-0 ${overdue ? "text-expense font-semibold" : "text-ink-2"}`}>
                        {fmtDate(x.due_date)}
                      </span>
                      <span className="font-bold text-ink-1 w-24 [font-variant-numeric:tabular-nums]">{money(Number(x.expected_amount))}</span>
                      <span className={`text-[10px] uppercase tracking-wider ${
                        x.status === "paid" ? "text-revenue" : x.status === "skipped" ? "text-ink-3" : overdue ? "text-expense" : "text-ink-2"
                      }`}>
                        {overdue ? "overdue" : x.status}
                      </span>
                      {x.gift_id && (
                        <span className="text-[10px] text-ink-3">gift recorded</span>
                      )}
                      <span className="ml-auto">
                        <PaymentActions paymentId={x.id} status={x.status} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
