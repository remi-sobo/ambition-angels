import type { SupabaseClient } from "@supabase/supabase-js";
import { OPEN_STAGE_LIST } from "@/lib/fundraising/stage-sets";
import { EXCLUDE_PARTNERSHIP_OPPS } from "@/lib/hubspot/stage-map";
import { constituentName } from "@/lib/fundraising/display";
import { addDaysISO, upcomingAskMoments, type AskMoment } from "@/lib/fundraising/plan";

// Server-side assembly of the ask calendar (specs/fundraising-plan.md):
// every scheduled ask moment in one stream — opportunity expected closes,
// open grant-requirement deadlines, unpaid pledge installments. Statuses are
// filtered at read time (never a snapshot) so a submitted requirement or a
// paid installment drops off the calendar the moment its record changes.
// Shared by /admin/fundraising/plan (90 days) and Today's Moves (7 days).

type ConstituentLite = {
  id: string;
  type: string;
  first_name: string | null;
  last_name: string | null;
  org_name: string | null;
} | null;

const REQUIREMENT_LABELS: Record<string, string> = {
  loi: "LOI due",
  application: "Application due",
  interim_report: "Interim report due",
  final_report: "Final report due",
  financial_report: "Financial report due",
  other: "Deadline",
};

export async function fetchAskMoments(
  supabase: SupabaseClient,
  orgId: string,
  from: string,
  days: number
): Promise<AskMoment[]> {
  const to = addDaysISO(from, days);

  const [oppsRes, reqsRes, paysRes] = await Promise.all([
    supabase
      .from("opportunities")
      .select(
        "id, name, stage, ask_amount, expected_close, " +
          "constituent:constituents ( id, type, first_name, last_name, org_name )"
      )
      .eq("org_id", orgId)
      .in("stage", OPEN_STAGE_LIST)
      .or(EXCLUDE_PARTNERSHIP_OPPS)
      .gte("expected_close", from)
      .lte("expected_close", to)
      .limit(200),
    supabase
      .from("grant_requirements")
      .select("id, kind, label, due_date, grant_id, grant:grants ( id, name )")
      .eq("org_id", orgId)
      .in("status", ["upcoming", "in_progress"])
      .gte("due_date", from)
      .lte("due_date", to)
      .limit(200),
    supabase
      .from("pledge_payments")
      .select(
        "id, due_date, expected_amount, pledge_id, " +
          "pledge:pledges ( id, constituent:constituents ( id, type, first_name, last_name, org_name ) )"
      )
      .eq("org_id", orgId)
      .eq("status", "scheduled")
      .gte("due_date", from)
      .lte("due_date", to)
      .limit(200),
  ]);

  const moments: AskMoment[] = [];

  for (const raw of oppsRes.data ?? []) {
    const o = raw as unknown as {
      id: string;
      name: string | null;
      ask_amount: number | null;
      expected_close: string | null;
      constituent: ConstituentLite;
    };
    if (!o.expected_close) continue;
    moments.push({
      kind: "opportunity_close",
      date: o.expected_close,
      label: o.name ?? (o.constituent ? constituentName(o.constituent) : "Open ask"),
      detail: "Ask expected to close",
      amount: o.ask_amount != null ? Number(o.ask_amount) : null,
      href: o.constituent ? `/admin/fundraising/donors/${o.constituent.id}` : "/admin/fundraising",
    });
  }

  for (const raw of reqsRes.data ?? []) {
    const r = raw as unknown as {
      id: string;
      kind: string;
      label: string | null;
      due_date: string;
      grant_id: string;
      grant: { id: string; name: string } | null;
    };
    moments.push({
      kind: "grant_requirement",
      date: r.due_date,
      label: r.grant?.name ?? "Grant",
      detail: r.label ?? REQUIREMENT_LABELS[r.kind] ?? "Deadline",
      amount: null,
      href: `/admin/fundraising/grants/${r.grant_id}`,
    });
  }

  for (const raw of paysRes.data ?? []) {
    const p = raw as unknown as {
      id: string;
      due_date: string;
      expected_amount: number;
      pledge_id: string;
      pledge: { id: string; constituent: ConstituentLite } | null;
    };
    const who = p.pledge?.constituent ? constituentName(p.pledge.constituent) : "Pledge";
    moments.push({
      kind: "pledge_installment",
      date: p.due_date,
      label: who,
      detail: "Pledge installment due",
      amount: Number(p.expected_amount),
      href: `/admin/fundraising/pledges/${p.pledge_id}`,
    });
  }

  return upcomingAskMoments(moments, { from, days });
}
