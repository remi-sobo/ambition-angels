import Link from "next/link";
import EmptyState from "../../_components/EmptyState";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext, ctxHasPermission } from "@/lib/admin/auth";
import { getActiveOrgMembers } from "@/lib/admin/owners-server";
import OwnerChip from "../../_components/OwnerChip";
import FilterTabs from "../_components/FilterTabs";
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
import { TYPE } from "@/lib/admin/typeScale";

// The Ask Log — every solicitation we make, in any form, always tied to a
// funder, with the proposal PDFs attached. Complements the grants and
// opportunities pipelines: an ask can link back to either.
//
// Extracted at Spec Fundraising F3: the V1 route renders it standalone
// (embedded=false — output byte-identical to the pre-F3 page) and the V2
// Pipeline screen renders it embedded below the board (section heading
// instead of the page chrome; same stats, form, and table).

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
  owner_id: string | null;
  owner: string | null;
};

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

export default async function AskLog({
  embedded = false,
  mine = false,
  filter,
}: {
  embedded?: boolean;
  /** V4 B2 "My asks": only asks whose owner_id is the viewer. */
  mine?: boolean;
  /** Where the All / My asks tabs point (the hosting page and its params). */
  filter?: { basePath: string; extraParams?: Record<string, string>; hash?: string };
}) {
  // Pinned to the ACTIVE org — RLS alone would merge rows from every org the
  // user belongs to.
  const ctx = await getOrgContext();
  if (!ctx) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8">
        <PageHeader title="Ask Log" subtitle="Sign in to view asks." />
      </div>
    );
  }
  const supabase = createServerSupabase();
  let query = supabase
    .from("asks")
    .select(
      "id, form, title, status, amount_requested, amount_committed, ask_date, grant_id, owner_id, owner, " +
        "funder:constituents(type, first_name, last_name, org_name), ask_documents(count)"
    )
    .eq("org_id", ctx.orgId);
  if (mine) query = query.eq("owner_id", ctx.userId);
  const [{ data, error }, members, canAssign] = await Promise.all([
    query
    .order("ask_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(500),
    getActiveOrgMembers(),
    ctxHasPermission(ctx, "fundraising.write"),
  ]);

  if (error) {
    return (
      <div className="min-h-screen bg-ink p-6 lg:p-10">
        <h1 className={`${TYPE.pageTitle} mb-4`}>Ask Log</h1>
        <div className="bg-tile border border-orange/30 rounded-panel-lg p-6 max-w-xl text-sm text-ink-2 leading-relaxed">
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
    <div className={embedded ? undefined : "min-h-screen bg-ink"}>
      <div className={embedded ? "space-y-6" : "max-w-[1400px] px-4 lg:px-8 py-6 lg:py-8 space-y-6"}>
        {embedded ? (
          <div className="flex items-baseline gap-3 pt-2">
            <h2 className={TYPE.cardTitle}>Ask Log</h2>
            <span className="text-xs text-ink-3">
              {stats.total} ask{stats.total === 1 ? "" : "s"} · every solicitation, tied to a funder
            </span>
          </div>
        ) : (
          <PageHeader
            title="Ask Log"
            subtitle={`${stats.total} ask${stats.total === 1 ? "" : "s"} · every solicitation, tied to a funder`}
          />
        )}

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

        <div className="flex flex-wrap items-center justify-between gap-3">
          {filter ? (
            <FilterTabs
              options={[
                { value: "all", label: "All asks" },
                { value: "mine", label: "My asks" },
              ]}
              current={mine ? "mine" : "all"}
              paramKey="asks"
              basePath={filter.basePath}
              extraParams={filter.extraParams}
              hash={filter.hash}
              size="sm"
            />
          ) : null}
          <NewAskForm />
        </div>

        <section className="bg-tile border-hairline rounded-panel-lg overflow-hidden">
          {asks.length === 0 ? (
            <div className="p-4">
              {mine ? (
                <EmptyState
                  label="asks"
                  title="No asks assigned to you"
                  hint="Asks you log are yours by default. Set the owner on any ask from its page or the Owner column on All asks."
                />
              ) : (
              <EmptyState
                label="asks"
                title="No asks logged yet"
                hint="Log every solicitation with “+ Log an ask” above (a grant proposal, a major-gift ask, a sponsorship request), and attach the PDF you sent."
              />
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-ink-3 border-b border-hairline">
                    <th className="text-left font-semibold px-5 py-3">Funder</th>
                    <th className="text-left font-semibold px-3 py-3">Ask</th>
                    <th className="text-left font-semibold px-3 py-3">Form</th>
                    <th className="text-right font-semibold px-3 py-3">Requested</th>
                    <th className="text-left font-semibold px-3 py-3">Date</th>
                    <th className="text-left font-semibold px-3 py-3">Status</th>
                    <th className="text-left font-semibold px-3 py-3">Owner</th>
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
                        <td className="px-3 py-3 max-w-[180px]">
                          <OwnerChip
                            entity="asks"
                            id={a.id}
                            ownerId={a.owner_id}
                            fallbackText={a.owner}
                            members={members}
                            meId={ctx.userId}
                            canEdit={canAssign}
                            variant="compact"
                          />
                        </td>
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
