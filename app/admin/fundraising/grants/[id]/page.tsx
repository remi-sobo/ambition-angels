import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { money } from "../../../finance/_components/charts";
import { todayISO } from "../../../ops/_types/ops";
import {
  StageSelect,
  RequirementActions,
  AddRequirementForm,
  STAGE_LABELS,
} from "../_components/GrantControls";

// Grant detail: award facts, stage control, and the requirements calendar.
export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = {
  loi: "LOI", application: "Application", interim_report: "Interim report",
  final_report: "Final report", financial_report: "Financial report", other: "Deadline",
};

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function GrantDetailPage({ params }: { params: { id: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();

  const supabase = getSupabaseAdmin();
  const [gRes, reqsRes] = await Promise.all([
    supabase
      .from("grants")
      .select("*, funder:constituents(id, org_name)")
      .eq("id", params.id)
      .maybeSingle(),
    supabase
      .from("grant_requirements")
      .select("*")
      .eq("grant_id", params.id)
      .order("due_date", { ascending: true }),
  ]);

  if (gRes.error) {
    return (
      <div className="min-h-screen bg-ink p-6 lg:p-10">
        <h1 className="font-heading font-bold text-cream text-2xl mb-4">Grants</h1>
        <div className="bg-[#1a1d27] border border-orange/30 rounded-card-lg p-6 max-w-xl text-sm text-gray-mid leading-relaxed">
          The grants tables aren&apos;t in this database yet. Apply{" "}
          <code className="text-orange">create_grants.sql</code> via Actions → Apply DB migration,
          then reload.
        </div>
      </div>
    );
  }
  if (!gRes.data) notFound();
  const g = gRes.data;
  const requirements = (reqsRes.data ?? []) as Array<{
    id: string; kind: string; label: string | null; due_date: string;
    status: string; submitted_at: string | null; notes: string | null;
  }>;
  const today = todayISO();

  const facts: Array<[string, string]> = [
    ["Funder", g.funder?.org_name ?? "—"],
    ["Requested", g.amount_requested != null ? money(Number(g.amount_requested)) : "—"],
    ["Awarded", g.amount_awarded != null ? money(Number(g.amount_awarded)) : "—"],
    ["Period", g.period_start || g.period_end
      ? `${g.period_start ? fmtDate(g.period_start) : "…"} → ${g.period_end ? fmtDate(g.period_end) : "…"}`
      : "—"],
    ["Program", g.program ?? "—"],
    ["Restrictions", g.restrictions ?? "Unrestricted (none recorded)"],
    ["Owner", g.owner ?? "—"],
  ];

  return (
    <div className="min-h-screen bg-ink">
      <div className="bg-[#13151f] border-b border-white/10 px-4 sm:px-6 lg:px-10 py-3 sm:py-4 sticky admin-sticky-top z-30 flex items-center gap-3 flex-wrap">
        <Link href="/admin/fundraising/grants" className="text-xs font-semibold text-gray-mid hover:text-cream transition-colors">
          ← Grants
        </Link>
        <span className="font-heading font-bold text-cream text-sm sm:text-base truncate">{g.name}</span>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange/15 text-orange uppercase tracking-wider">
          {STAGE_LABELS[g.stage] ?? g.stage}
        </span>
        <div className="ml-auto">
          <StageSelect grantId={g.id} stage={g.stage} />
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-8 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <section className="lg:col-span-5 bg-[#1a1d27] border border-white/10 rounded-card-lg p-5 space-y-3">
            <h2 className="font-heading font-bold text-cream text-sm mb-1">Details</h2>
            {facts.map(([label, value]) => (
              <div key={label} className="flex gap-3 text-xs">
                <span className="text-white/30 w-24 flex-shrink-0 uppercase tracking-wider font-semibold pt-px">{label}</span>
                <span className="text-cream/85 break-words min-w-0">{value}</span>
              </div>
            ))}
            {g.notes && <p className="text-xs text-gray-mid border-t border-white/10 pt-3 whitespace-pre-wrap">{g.notes}</p>}
          </section>

          <section className="lg:col-span-7 bg-[#1a1d27] border border-white/10 rounded-card-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10">
              <h2 className="font-heading font-bold text-cream text-sm">Requirements Calendar</h2>
            </div>
            {requirements.length === 0 ? (
              <p className="px-5 py-6 text-gray-mid text-sm">
                No deadlines yet — add the application, reports, and anything else the funder
                expects. Awarded grants auto-plot a final report at the period end.
              </p>
            ) : (
              <ul className="divide-y divide-white/5">
                {requirements.map((r) => {
                  const open = r.status === "upcoming" || r.status === "in_progress";
                  const isOverdue = open && r.due_date < today;
                  return (
                    <li key={r.id} className="px-5 py-3 flex items-center gap-3">
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                          isOverdue
                            ? "bg-red-500/15 text-red-400"
                            : open
                            ? "bg-white/5 text-gray-mid"
                            : "bg-green-500/10 text-green-400"
                        }`}
                      >
                        {fmtDate(r.due_date)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm font-medium truncate ${open ? "text-cream/90" : "text-white/40 line-through"}`}>
                          {r.label || KIND_LABELS[r.kind]}
                        </div>
                        {r.notes && <div className="text-[11px] text-gray-mid truncate">{r.notes}</div>}
                      </div>
                      {r.status === "submitted" && r.submitted_at && (
                        <span className="text-[11px] text-green-400 whitespace-nowrap">
                          Submitted {new Date(r.submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      )}
                      {r.status === "waived" && <span className="text-[11px] text-white/30">Waived</span>}
                      {open && <RequirementActions id={r.id} status={r.status} />}
                    </li>
                  );
                })}
              </ul>
            )}
            <AddRequirementForm grantId={g.id} />
          </section>
        </div>
      </div>
    </div>
  );
}
