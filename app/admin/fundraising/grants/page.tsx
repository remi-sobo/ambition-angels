import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { money } from "../../finance/_components/charts";
import StatCard from "../../_components/StatCard";
import { todayISO } from "../../ops/_types/ops";
import { NewGrantForm } from "./_components/GrantControls";
import { STAGES, STAGE_LABELS } from "./_lib/stages";

// Grants pipeline + requirements calendar (Ring 2,
// modules/03-fundraising.md "Grants"). Pipeline columns mirror the spec
// stages; the deadlines rail is the requirements calendar — every funder
// deadline lives in grant_requirements, never in someone's head.
export const dynamic = "force-dynamic";

type Grant = {
  id: string;
  name: string;
  stage: string;
  amount_requested: number | null;
  amount_awarded: number | null;
  period_end: string | null;
  funder: { org_name: string | null } | null;
};

type Requirement = {
  id: string;
  grant_id: string;
  kind: string;
  label: string | null;
  due_date: string;
  status: string;
  grants: { name: string } | null;
};

const KIND_LABELS: Record<string, string> = {
  loi: "LOI", application: "Application", interim_report: "Interim report",
  final_report: "Final report", financial_report: "Financial report", other: "Deadline",
};

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// Pipeline order for display; declined/closed collapse into a footer row.
const BOARD_STAGES = ["prospect", "qualified", "loi", "proposal", "submitted", "awarded", "active"] as const;

export default async function GrantsPage() {
  const supabase = getSupabaseAdmin();
  const [grantsRes, reqsRes] = await Promise.all([
    supabase
      .from("grants")
      .select("id, name, stage, amount_requested, amount_awarded, period_end, funder:constituents(org_name)")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("grant_requirements")
      .select("id, grant_id, kind, label, due_date, status, grants(name)")
      .in("status", ["upcoming", "in_progress"])
      .order("due_date", { ascending: true })
      .limit(20),
  ]);

  if (grantsRes.error) {
    return (
      <div className="min-h-screen bg-ink p-6 lg:p-10">
        <h1 className="font-heading font-bold text-cream text-2xl mb-4">Grants</h1>
        <div className="bg-[#231f18] border border-orange/30 rounded-card-lg p-6 max-w-xl text-sm text-gray-mid leading-relaxed">
          The grants tables aren&apos;t in this database yet. Apply{" "}
          <code className="text-orange">create_grants.sql</code> via Actions → Apply DB migration,
          then reload.
        </div>
      </div>
    );
  }

  const grants = ((grantsRes.data ?? []) as unknown as Grant[]).map((g) => ({
    ...g,
    amount_requested: g.amount_requested === null ? null : Number(g.amount_requested),
    amount_awarded: g.amount_awarded === null ? null : Number(g.amount_awarded),
  }));
  const requirements = (reqsRes.data ?? []) as unknown as Requirement[];
  const today = todayISO();

  const byStage = new Map<string, Grant[]>(STAGES.map((s) => [s, []]));
  for (const g of grants) byStage.get(g.stage)?.push(g);

  const grantValue = (g: Grant) => g.amount_awarded ?? g.amount_requested ?? 0;
  const openPipeline = grants
    .filter((g) => ["prospect", "qualified", "loi", "proposal", "submitted"].includes(g.stage))
    .reduce((s, g) => s + grantValue(g), 0);
  const awardedTotal = grants
    .filter((g) => ["awarded", "active"].includes(g.stage))
    .reduce((s, g) => s + (g.amount_awarded ?? 0), 0);
  const overdue = requirements.filter((r) => r.due_date < today);
  const closedCount = (byStage.get("declined")?.length ?? 0) + (byStage.get("closed")?.length ?? 0);

  return (
    <div className="min-h-screen bg-ink">
      <div className="bg-[#19150f] border-b border-white/10 px-4 lg:px-8 py-3 sm:py-4 sticky admin-sticky-top z-30 flex items-center justify-between gap-3">
        <span className="font-heading font-bold text-cream text-sm sm:text-base">Grants</span>
        <span className="text-xs text-gray-mid">{grants.length} total{closedCount > 0 ? ` · ${closedCount} declined/closed` : ""}</span>
      </div>

      <div className="max-w-[1400px] px-4 lg:px-8 py-6 lg:py-8 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 flex-1 min-w-0">
            <StatCard label="Open Pipeline" value={money(openPipeline)} sub="prospect → submitted" />
            <StatCard label="Awarded" value={money(awardedTotal)} sub="awarded + active grants" />
            <StatCard
              label="Open Deadlines"
              value={requirements.length}
              delta={overdue.length > 0 ? { text: `${overdue.length} overdue`, direction: "down" } : undefined}
            />
            <StatCard
              label="Next Deadline"
              value={requirements[0] ? fmtDate(requirements[0].due_date) : "—"}
              sub={requirements[0] ? `${KIND_LABELS[requirements[0].kind]} · ${requirements[0].grants?.name ?? ""}` : "nothing scheduled"}
            />
          </div>
        </div>

        <NewGrantForm />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* ── Pipeline ── */}
          <section className="lg:col-span-8 bg-[#231f18] border border-white/10 rounded-card-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10">
              <h2 className="font-heading font-bold text-cream text-sm">Pipeline</h2>
            </div>
            <div className="overflow-x-auto">
              <div className="flex gap-3 p-4 min-w-[900px]">
                {BOARD_STAGES.map((stage) => {
                  const items = byStage.get(stage) ?? [];
                  const total = items.reduce((s, g) => s + grantValue(g), 0);
                  return (
                    <div key={stage} className="flex-1 min-w-[120px]">
                      <div className="text-[10px] font-heading font-semibold uppercase tracking-[0.12em] text-white/35 mb-0.5">
                        {STAGE_LABELS[stage]}
                      </div>
                      <div className="text-[11px] text-gray-mid mb-2 [font-variant-numeric:tabular-nums]">
                        {items.length} · {money(total)}
                      </div>
                      <div className="space-y-2">
                        {items.map((g) => (
                          <Link
                            key={g.id}
                            href={`/admin/fundraising/grants/${g.id}`}
                            className="block bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-2.5 py-2 transition-colors"
                          >
                            <div className="text-xs font-medium text-cream truncate">{g.name}</div>
                            <div className="text-[11px] text-gray-mid truncate">
                              {g.funder?.org_name ?? "—"}
                            </div>
                            <div className="text-[11px] text-orange font-semibold [font-variant-numeric:tabular-nums]">
                              {grantValue(g) > 0 ? money(grantValue(g)) : ""}
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {closedCount > 0 && (
              <div className="px-4 py-3 border-t border-white/10">
                <div className="text-[10px] font-heading font-semibold uppercase tracking-[0.12em] text-white/35 mb-2">
                  Declined / Closed
                </div>
                <div className="flex flex-wrap gap-2">
                  {[...(byStage.get("declined") ?? []), ...(byStage.get("closed") ?? [])].map((g) => (
                    <Link
                      key={g.id}
                      href={`/admin/fundraising/grants/${g.id}`}
                      className="text-xs text-white/40 hover:text-cream bg-white/5 border border-white/10 rounded-full px-2.5 py-1 transition-colors"
                    >
                      {g.name} · {STAGE_LABELS[g.stage]}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* ── Requirements calendar ── */}
          <section className="lg:col-span-4 bg-[#231f18] border border-white/10 rounded-card-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10">
              <h2 className="font-heading font-bold text-cream text-sm">Upcoming Deadlines</h2>
            </div>
            {requirements.length === 0 ? (
              <p className="p-6 text-gray-mid text-sm">
                No open deadlines. Every grant&apos;s LOIs, applications, and reports belong here —
                add them from the grant&apos;s page.
              </p>
            ) : (
              <ul className="divide-y divide-white/5">
                {requirements.map((r) => {
                  const isOverdue = r.due_date < today;
                  return (
                    <li key={r.id} className="px-5 py-3">
                      <Link href={`/admin/fundraising/grants/${r.grant_id}`} className="flex items-start justify-between gap-3 group">
                        <div className="min-w-0">
                          <div className="text-sm text-cream/90 font-medium truncate group-hover:text-orange transition-colors">
                            {r.label || KIND_LABELS[r.kind]}
                          </div>
                          <div className="text-[11px] text-gray-mid truncate">{r.grants?.name}</div>
                        </div>
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                            isOverdue ? "bg-red-500/15 text-red-400" : "bg-white/5 text-gray-mid"
                          }`}
                        >
                          {isOverdue ? "Overdue · " : ""}{fmtDate(r.due_date)}
                        </span>
                      </Link>
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
