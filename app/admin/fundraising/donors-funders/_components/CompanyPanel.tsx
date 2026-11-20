import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import StageStrip from "../../../_components/StageStrip";
import { money } from "../../../finance/_components/charts";
import { TYPE } from "@/lib/admin/typeScale";
import { isOpenStage } from "@/lib/fundraising/stage-sets";
import {
  COMPANY_STAGES,
  COMPANY_STAGE_HELP,
  COMPANY_STAGE_LABELS,
  OPEN_ASK_STATUSES,
  isCompanyStage,
  normalizeDomain,
} from "@/lib/fundraising/company-stages";
import { CompanyDomains, CompanyStageSelect, TrackAsCompanyButton } from "./CompanyControls";

// Company view of the Donor 360 (specs/bloomos-companies.md, Stage 1). Renders
// on organization constituents only. With a stage: the stage strip, next step,
// email domains, and the money the rest of the profile does not show (pledges
// from the pledges table, open asks and open opportunities). Without one: a
// single line offering to track the organization as a company.
//
// People and activity panels are Stages 2 to 4.

const fmtDate = (iso: string) =>
  new Date(iso.length === 10 ? iso + "T00:00:00" : iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const ASK_STATUS_LABEL: Record<string, string> = { draft: "Draft", submitted: "Submitted", pending: "Pending" };
const ASK_FORM_LABEL: Record<string, string> = {
  grant_proposal: "Grant proposal",
  loi: "LOI",
  major_gift: "Major gift",
  corporate_sponsorship: "Corporate sponsorship",
  event_sponsorship: "Event sponsorship",
  in_kind: "In-kind",
  appeal: "Appeal",
  verbal: "Verbal",
  email: "Email",
  letter: "Letter",
  other: "Other",
};

export default async function CompanyPanel({
  constituentId,
  orgId,
  companyStage,
  domains,
  hubspotCompanyId,
}: {
  constituentId: string;
  orgId: string;
  companyStage: string | null;
  domains: string[];
  hubspotCompanyId: string | null;
}) {
  if (!isCompanyStage(companyStage)) {
    return (
      <section className="bg-tile border-hairline rounded-panel-lg px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className={TYPE.cardTitle}>Company</h2>
          <p className={`${TYPE.bodyMuted} mt-1`}>
            Track this organization as a company to see it on the Companies list with a stage and next step.
          </p>
        </div>
        <TrackAsCompanyButton id={constituentId} />
      </section>
    );
  }

  const supabase = createServerSupabase();
  const [pledgesRes, asksRes, oppsRes, taskRes, hsRes] = await Promise.all([
    supabase
      .from("pledges")
      .select("id, total_amount, installment_count, frequency, start_date, status")
      .eq("org_id", orgId)
      .eq("constituent_id", constituentId)
      .order("start_date", { ascending: false })
      .limit(50),
    supabase
      .from("asks")
      .select("id, title, form, amount_requested, ask_date, status")
      .eq("org_id", orgId)
      .eq("funder_id", constituentId)
      .in("status", [...OPEN_ASK_STATUSES])
      .order("ask_date", { ascending: false, nullsFirst: false })
      .limit(50),
    supabase
      .from("opportunities")
      .select("id, name, stage, ask_amount, expected_close")
      .eq("org_id", orgId)
      .eq("constituent_id", constituentId)
      .limit(50),
    supabase
      .from("ops_tasks")
      .select("id, title, due_date")
      .eq("org_id", orgId)
      .eq("linked_entity_type", "constituent")
      .eq("linked_entity_id", constituentId)
      .neq("status", "done")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(1),
    hubspotCompanyId
      ? supabase.from("hs_companies").select("domain").eq("org_id", orgId).eq("hubspot_id", hubspotCompanyId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  type Pledge = { id: string; total_amount: number; installment_count: number; frequency: string; start_date: string; status: string };
  type Ask = { id: string; title: string | null; form: string; amount_requested: number | null; ask_date: string | null; status: string };
  type Opp = { id: string; name: string | null; stage: string; ask_amount: number | null; expected_close: string | null };

  const pledges = (pledgesRes.data ?? []) as Pledge[];
  const asks = (asksRes.data ?? []) as Ask[];
  const opps = ((oppsRes.data ?? []) as Opp[]).filter((o) => isOpenStage(o.stage));
  const nextTask = ((taskRes.data ?? []) as Array<{ id: string; title: string; due_date: string | null }>)[0] ?? null;
  const hsDomain = (hsRes.data as { domain: string | null } | null)?.domain ?? null;
  const suggested = hsDomain ? normalizeDomain(hsDomain) : null;

  const activePledged = pledges.filter((p) => p.status === "active").reduce((s, p) => s + Number(p.total_amount), 0);
  const openAskTotal =
    asks.reduce((s, a) => s + Number(a.amount_requested ?? 0), 0) +
    opps.reduce((s, o) => s + Number(o.ask_amount ?? 0), 0);

  return (
    <section className="bg-tile border-hairline rounded-panel-lg px-5 py-4 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className={TYPE.cardTitle}>Company</h2>
        <CompanyStageSelect id={constituentId} stage={companyStage} />
      </div>

      <StageStrip
        cells={COMPANY_STAGES.map((s) => ({
          key: s,
          label: COMPANY_STAGE_LABELS[s],
          value: s === companyStage ? "●" : "·",
          active: s === companyStage,
          title: COMPANY_STAGE_HELP[s],
        }))}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-1">
          <p className={TYPE.cardLabel}>Next step</p>
          {nextTask ? (
            <p className={TYPE.body}>
              {nextTask.title}
              {nextTask.due_date ? <span className="text-ink-2"> · due {fmtDate(nextTask.due_date)}</span> : null}
            </p>
          ) : (
            <p className={TYPE.bodyMuted}>No open task. Add one under Tasks on this page.</p>
          )}
        </div>
        <CompanyDomains id={constituentId} domains={domains} suggested={suggested} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <div className="flex items-baseline justify-between gap-2 mb-2">
            <h3 className={TYPE.subsectionTitle}>Open asks</h3>
            <span className={TYPE.metadata}>{openAskTotal > 0 ? `${money(openAskTotal)} open` : ""}</span>
          </div>
          {asks.length === 0 && opps.length === 0 ? (
            <p className={TYPE.bodyMuted}>Nothing open. Log an ask or add an opportunity to see it here.</p>
          ) : (
            <ul className="divide-y divide-hairline">
              {asks.map((a) => (
                <li key={a.id} className="py-2 flex items-center justify-between gap-3">
                  <Link href={`/admin/fundraising/asks/${a.id}`} className="text-sm text-ink-1 hover:text-orange truncate">
                    {a.title || ASK_FORM_LABEL[a.form] || "Ask"}
                  </Link>
                  <span className={`${TYPE.metadata} whitespace-nowrap`}>
                    {ASK_STATUS_LABEL[a.status] ?? a.status}
                    {a.amount_requested ? ` · ${money(Number(a.amount_requested))}` : ""}
                  </span>
                </li>
              ))}
              {opps.map((o) => (
                <li key={o.id} className="py-2 flex items-center justify-between gap-3">
                  <Link href={`/admin/fundraising/pipeline/${o.id}`} className="text-sm text-ink-1 hover:text-orange truncate">
                    {o.name || "Opportunity"}
                  </Link>
                  <span className={`${TYPE.metadata} whitespace-nowrap`}>
                    Pipeline
                    {o.ask_amount ? ` · ${money(Number(o.ask_amount))}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="flex items-baseline justify-between gap-2 mb-2">
            <h3 className={TYPE.subsectionTitle}>Pledges</h3>
            <span className={TYPE.metadata}>{activePledged > 0 ? `${money(activePledged)} active` : ""}</span>
          </div>
          {pledges.length === 0 ? (
            <p className={TYPE.bodyMuted}>No pledges recorded.</p>
          ) : (
            <ul className="divide-y divide-hairline">
              {pledges.map((p) => (
                <li key={p.id} className="py-2 flex items-center justify-between gap-3">
                  <Link href={`/admin/fundraising/pledges/${p.id}`} className="text-sm text-ink-1 hover:text-orange">
                    {money(Number(p.total_amount))} · {p.installment_count} {p.frequency}
                  </Link>
                  <span className={`${TYPE.metadata} whitespace-nowrap`}>
                    {p.status === "active" ? "Active" : p.status === "completed" ? "Completed" : "Cancelled"} · from{" "}
                    {fmtDate(p.start_date)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <p className={TYPE.metadata}>Gifts and grants for this company are in the sections below.</p>
    </section>
  );
}
