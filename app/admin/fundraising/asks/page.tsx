import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { money } from "../../finance/_components/charts";
import StatCard from "../../_components/StatCard";
import PageHeader from "../../_components/PageHeader";
import { constituentName } from "@/lib/fundraising/display";
import {
  ASK_FORM_LABELS,
  computeAskStats,
  type AskForStats,
} from "@/lib/fundraising/asks";
import { NewAskForm, StatusChip } from "./_components/AskControls";

// The Ask Log — every solicitation we make, in any form, always tied to a
// funder, with the proposal PDFs attached. Complements the grants and
// opportunities pipelines: an ask can link back to either.
export const dynamic = "force-dynamic";

type FunderRef = {
  type: string;
  first_name: string | null;
  last_name: string | null;
  org_name: string | null;
} | null;

type Ask = {
  id: string;
  form: string;
  title: string | null;
  status: string;
  amount_requested: number | null;
  amount_committed: number | null;
  ask_date: string | null;
  grant_id: string | null;
  funder: FunderRef;
  ask_documents: { count: number }[] | null;
};

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

export default async function AsksPage() {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("asks")
    .select(
      "id, form, title, status, amount_requested, amount_committed, ask_date, grant_id, " +
        "funder:constituents(type, first_name, last_name, org_name), ask_documents(count)"
    )
    .order("ask_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return (
      <div className="min-h-screen bg-ink p-6 lg:p-10">
        <h1 className="font-heading font-bold text-ink-1 text-2xl mb-4">Ask Log</h1>
        <div className="bg-tile shadow-tile border border-orange/30 rounded-card-lg p-6 max-w-xl text-sm text-ink-2 leading-relaxed">
          The ask log tables aren&apos;t in this database yet. Apply{" "}
          <code className="text-orange">create_asks_log.sql</code> via Actions → Apply DB migration,
          then reload.
        </div>
      </div>
    );
  }

  const asks = ((data ?? []) as unknown as Ask[]).map((a) => ({
    ...a,
    amount_requested: a.amount_requested === null ? null : Number(a.amount_requested),
    amount_committed: a.amount_committed === null ? null : Number(a.amount_committed),
  }));

  const stats = computeAskStats(asks as AskForStats[]);

  return (
    <div className="min-h-screen bg-ink">
      <div className="max-w-[1400px] px-4 lg:px-8 py-6 lg:py-8 space-y-6">
        <PageHeader
          title="Ask Log"
          subtitle={`${stats.total} ask${stats.total === 1 ? "" : "s"} · every solicitation, tied to a funder`}
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Outstanding Asks" value={money(stats.outstanding)} sub={`${stats.openCount} open`} />
          <StatCard label="Committed" value={money(stats.committed)} sub={`${stats.wonCount} won`} />
          <StatCard
            label="Win Rate"
            value={stats.winRate === null ? "—" : `${Math.round(stats.winRate * 100)}%`}
            sub={stats.decidedCount > 0 ? `${stats.wonCount}/${stats.decidedCount} decided` : "nothing decided yet"}
          />
          <StatCard label="Total Asks" value={stats.total} sub="all time" />
        </div>

        <NewAskForm />

        <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
          {asks.length === 0 ? (
            <p className="p-6 text-ink-2 text-sm">
              No asks logged yet. Log every solicitation — a grant proposal, a major-gift ask, a
              sponsorship request — and attach the PDF you sent.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-ink-3 border-b border-outline">
                    <th className="text-left font-semibold px-5 py-3">Funder</th>
                    <th className="text-left font-semibold px-3 py-3">Ask</th>
                    <th className="text-left font-semibold px-3 py-3">Form</th>
                    <th className="text-right font-semibold px-3 py-3">Requested</th>
                    <th className="text-left font-semibold px-3 py-3">Date</th>
                    <th className="text-left font-semibold px-3 py-3">Status</th>
                    <th className="text-center font-semibold px-3 py-3">Docs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {asks.map((a) => {
                    const docCount = a.ask_documents?.[0]?.count ?? 0;
                    return (
                      <tr key={a.id} className="hover:bg-orange/[0.04] transition-colors">
                        <td className="px-5 py-3">
                          <Link href={`/admin/fundraising/asks/${a.id}`} className="text-ink-1 font-medium hover:text-orange transition-colors">
                            {a.funder ? constituentName(a.funder) : "—"}
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-ink-2 max-w-[220px] truncate">{a.title || "—"}</td>
                        <td className="px-3 py-3 text-ink-2 whitespace-nowrap">{ASK_FORM_LABELS[a.form] ?? a.form}</td>
                        <td className="px-3 py-3 text-right text-ink-1 tabular-nums whitespace-nowrap">
                          {a.amount_requested != null ? money(a.amount_requested) : "—"}
                        </td>
                        <td className="px-3 py-3 text-ink-2 whitespace-nowrap">{fmtDate(a.ask_date)}</td>
                        <td className="px-3 py-3"><StatusChip status={a.status} /></td>
                        <td className="px-3 py-3 text-center text-ink-2 tabular-nums">{docCount || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
