import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { constituentName } from "@/lib/fundraising/display";
import {
  givingByYear,
  reportingOwed,
  REQUIREMENT_KIND_LABEL,
  type GiftHistoryRow,
  type RequirementRow,
} from "@/lib/fundraising/donor360";
import { money } from "../../../finance/_components/charts";
import { todayISO } from "../../../ops/_types/ops";
import { TYPE } from "@/lib/admin/typeScale";
import WhyTheyMatter from "./WhyTheyMatter";

// Spec Fundraising F2 — the panels the Donor 360 adds on top of the V1
// profile: the why-they-matter narrative (decision 1), giving by year,
// reporting owed (grant_requirements for grants where this constituent is
// the funder), and connected constituents (relationships + households —
// which launches near-empty by the signed ruling: it waits on data, not a
// spec). Server component; renders ONLY on the donors-funders route.

const fmtDue = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function Donor360Extras({
  constituentId,
  name,
  whyMatters,
  history,
}: {
  constituentId: string;
  name: string;
  whyMatters: string | null;
  history: GiftHistoryRow[];
}) {
  const supabase = createServerSupabase();
  const today = todayISO();

  const [grantsRes, relRes] = await Promise.all([
    supabase
      .from("grants")
      .select("id, name, stage, amount_awarded, grant_requirements ( id, kind, label, due_date, status )")
      .eq("funder_id", constituentId)
      .limit(100),
    supabase
      .from("relationships")
      .select("id, a_id, b_id, kind, notes")
      .or(`a_id.eq.${constituentId},b_id.eq.${constituentId}`)
      .limit(100),
  ]);

  type GrantRow = {
    id: string;
    name: string;
    stage: string;
    amount_awarded: number | null;
    grant_requirements: Array<{ id: string; kind: string; label: string | null; due_date: string; status: string }> | null;
  };
  const grants = (grantsRes.data ?? []) as GrantRow[];
  const requirements: RequirementRow[] = grants.flatMap((g) =>
    (g.grant_requirements ?? []).map((r) => ({ ...r, grant_name: g.name })),
  );
  const owed = reportingOwed(requirements);

  type RelRow = { id: string; a_id: string; b_id: string; kind: string; notes: string | null };
  const rels = (relRes.data ?? []) as RelRow[];
  const otherIds = Array.from(
    new Set(rels.map((r) => (r.a_id === constituentId ? r.b_id : r.a_id))),
  );
  const otherNames = new Map<string, string>();
  if (otherIds.length > 0) {
    const { data: others } = await supabase
      .from("constituents")
      .select("id, type, first_name, last_name, org_name, emails")
      .in("id", otherIds);
    for (const o of (others ?? []) as Array<{
      id: string; type: string; first_name: string | null; last_name: string | null;
      org_name: string | null; emails: string[] | null;
    }>) {
      otherNames.set(o.id, constituentName(o));
    }
  }

  const years = givingByYear(history);

  return (
    <>
      <WhyTheyMatter constituentId={constituentId} name={name} initial={whyMatters} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── Giving by year ── */}
        <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-outline">
            <h2 className={TYPE.cardTitle}>Giving by Year</h2>
          </div>
          {years.length === 0 ? (
            <p className={`p-6 ${TYPE.bodyMuted}`}>No gifts on record yet.</p>
          ) : (
            <ul className="divide-y divide-hairline">
              {years.map((y) => (
                <li key={y.year} className="px-5 py-2.5 flex items-center gap-3">
                  <span className="text-xs text-ink-2 w-14 [font-variant-numeric:tabular-nums]">{y.year}</span>
                  <span className="font-bold text-ink-1 [font-variant-numeric:tabular-nums]">{money(y.total)}</span>
                  <span className="ml-auto text-xs text-ink-3 [font-variant-numeric:tabular-nums]">
                    {y.count} gift{y.count === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Reporting owed ── */}
        <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-outline flex items-center gap-3">
            <h2 className={TYPE.cardTitle}>Reporting Owed</h2>
            {grants.length > 0 && (
              <Link
                href="/admin/fundraising/grants"
                className="ml-auto text-[11px] font-semibold text-ink-2 hover:text-orange transition-colors"
              >
                Grants →
              </Link>
            )}
          </div>
          {grants.length === 0 ? (
            <p className={`p-6 ${TYPE.bodyMuted}`}>No grants from this funder.</p>
          ) : owed.length === 0 ? (
            <p className={`p-6 ${TYPE.bodyMuted}`}>
              Nothing owed: every requirement on this funder&apos;s grants is submitted or waived.
            </p>
          ) : (
            <ul className="divide-y divide-hairline">
              {owed.map((r) => {
                const overdue = r.due_date < today;
                return (
                  <li key={r.id} className="px-5 py-3 flex items-center gap-3 flex-wrap">
                    <span className="text-sm text-ink-1 font-medium">
                      {r.label || REQUIREMENT_KIND_LABEL[r.kind] || r.kind}
                    </span>
                    <span className="text-[11px] text-ink-3 truncate max-w-[180px]">{r.grant_name}</span>
                    <span
                      className={`ml-auto text-xs font-semibold [font-variant-numeric:tabular-nums] ${
                        overdue ? "text-expense" : "text-ink-2"
                      }`}
                    >
                      {overdue ? "Overdue · " : "Due "}
                      {fmtDue(r.due_date)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* ── Connected (relationships) — launches near-empty by signed ruling:
             bound, not dormant; it waits on data, not a spec. Households
             render in the V1 household panel below. ── */}
      <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-outline">
          <h2 className={TYPE.cardTitle}>Connected</h2>
        </div>
        {rels.length === 0 ? (
          <p className={`p-6 ${TYPE.bodyMuted}`}>
            No linked relationships yet. Spouse, employer, and knows-links appear here as they
            are recorded; household giving rolls up in the Household panel below.
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {rels.map((r) => {
              const otherId = r.a_id === constituentId ? r.b_id : r.a_id;
              return (
                <li key={r.id} className="px-5 py-3 flex items-center gap-3 flex-wrap">
                  <Link
                    href={`/admin/fundraising/donors-funders/${otherId}`}
                    className="text-sm font-medium text-ink-1 hover:text-orange transition-colors"
                  >
                    {otherNames.get(otherId) ?? "Unknown constituent"}
                  </Link>
                  <span className="text-[10px] uppercase tracking-wider text-ink-3">{r.kind}</span>
                  {r.notes && <span className="text-xs text-ink-3 truncate max-w-[280px]">{r.notes}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
