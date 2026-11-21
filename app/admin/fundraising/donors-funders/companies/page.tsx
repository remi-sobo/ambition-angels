import Link from "next/link";
import PageHeader from "../../../_components/PageHeader";
import EmptyState from "../../../_components/EmptyState";
import FilterTabs from "../../_components/FilterTabs";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { TYPE } from "@/lib/admin/typeScale";
import { money } from "../../../finance/_components/charts";
import { loadCompanies, type CompanyRow } from "@/lib/fundraising/companies";
import { COMPANY_STAGES, COMPANY_STAGE_HELP, COMPANY_STAGE_LABELS } from "@/lib/fundraising/company-stages";
import { AddCompany } from "../_components/CompanyControls";
import { StaticTable } from "../../../_components/ui/DataTable";

// Companies (specs/bloomos-companies.md, Stage 1): organization constituents
// that staff track with a company stage. A view of the one Donors & Funders
// list, so it sits under that tab rather than adding a sixth fundraising tab;
// rows open the same Donor 360 page. List and board read the same rows.
export const dynamic = "force-dynamic";

const BASE = "/admin/fundraising/donors-funders/companies";
const PROFILE = (id: string) => `/admin/fundraising/donors-funders/${id}`;

const fmtDate = (iso: string) =>
  new Date(iso.length === 10 ? iso + "T00:00:00" : iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

function NextStep({ row }: { row: CompanyRow }) {
  if (!row.nextStep) return <span className="text-ink-2">None set</span>;
  return (
    <span>
      {row.nextStep.title}
      {row.nextStep.due ? <span className="text-ink-2"> · {fmtDate(row.nextStep.due)}</span> : null}
    </span>
  );
}

export default async function CompaniesPage({ searchParams }: { searchParams: { view?: string } }) {
  const view = searchParams.view === "board" ? "board" : "list";
  const ctx = await getOrgContext();
  if (!ctx) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8">
        <PageHeader title="Companies" subtitle="Sign in to view companies." />
      </div>
    );
  }

  const { rows, error } = await loadCompanies(createServerSupabase(), ctx.orgId);

  return (
    <div className="min-h-screen bg-ink">
      <div className="max-w-[1400px] px-4 lg:px-8 py-6 lg:py-8 space-y-5">
        <Link
          href="/admin/fundraising/donors-funders"
          className="text-xs font-semibold text-ink-2 hover:text-ink-1 transition-colors"
        >
          ← Donors & Funders
        </Link>
        <PageHeader
          title="Companies"
          subtitle={`${rows.length} ${rows.length === 1 ? "company" : "companies"} · money, people and next step in one place`}
          actions={<AddCompany />}
        />

        <FilterTabs
          options={[
            { value: "list", label: "List" },
            { value: "board", label: "Board" },
          ]}
          current={view}
          paramKey="view"
          basePath={BASE}
        />

        {error ? (
          <div className="bg-tile border border-orange/30 rounded-panel-lg p-6 max-w-xl text-sm text-ink-2 leading-relaxed">
            Companies could not load. If this is a new database, apply{" "}
            <code className="text-orange">add_company_stage_to_constituents.sql</code> and reload.
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            label="companies"
            hint="Add one with the button above. Search for the organization first: most companies are already here from HubSpot."
          />
        ) : view === "board" ? (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {COMPANY_STAGES.map((s) => {
              const inStage = rows.filter((r) => r.stage === s);
              return (
                <div key={s} className="w-[220px] shrink-0 bg-tile border-hairline rounded-panel-lg p-3 space-y-2">
                  <div className="flex items-baseline justify-between gap-2" title={COMPANY_STAGE_HELP[s]}>
                    <h2 className={TYPE.cardTitle}>{COMPANY_STAGE_LABELS[s]}</h2>
                    <span className={TYPE.metadata}>{inStage.length}</span>
                  </div>
                  {inStage.map((r) => (
                    <Link
                      key={r.id}
                      href={PROFILE(r.id)}
                      className="block bg-surface border-hairline rounded-control px-3 py-2 hover:border-orange/40 transition-colors"
                    >
                      <span className="block text-sm font-semibold text-ink-1 truncate">{r.name}</span>
                      <span className={`block ${TYPE.metadata}`}>
                        {money(r.given)} given
                        {r.openAskCount > 0 ? ` · ${r.openAskCount} open` : ""}
                      </span>
                    </Link>
                  ))}
                </div>
              );
            })}
          </div>
        ) : (
          // The kit table (V4 P1): cards under 640px, the next step last.
          <StaticTable
            label="Companies"
            noun={{ one: "company", many: "companies" }}
            rows={rows}
            getRowId={(r) => r.id}
            getRowLabel={(r) => r.name}
            columns={[
              {
                key: "company",
                header: "Company",
                card: "title",
                render: (r) => (
                  <Link href={PROFILE(r.id)} className="font-semibold text-ink-1 hover:text-orange transition-colors">
                    {r.name}
                  </Link>
                ),
              },
              {
                key: "stage",
                header: "Stage",
                render: (r) => (
                  <span className="whitespace-nowrap" title={COMPANY_STAGE_HELP[r.stage]}>
                    {COMPANY_STAGE_LABELS[r.stage]}
                  </span>
                ),
              },
              { key: "given", header: "Given to date", align: "right", render: (r) => <span className="tabular-nums whitespace-nowrap">{money(r.given)}</span> },
              {
                key: "asks",
                header: "Open asks",
                render: (r) => (
                  <span className="tabular-nums whitespace-nowrap">
                    {r.openAskCount > 0 ? `${r.openAskCount} · ${money(r.openAskTotal)}` : <span className="text-ink-2">None</span>}
                  </span>
                ),
              },
              {
                key: "activity",
                header: "Last activity",
                render: (r) => <span className="whitespace-nowrap">{r.lastActivity ? fmtDate(r.lastActivity) : <span className="text-ink-2">None</span>}</span>,
              },
            ]}
            nextStep={{ header: "Next step", render: (r) => <NextStep row={r} /> }}
          />
        )}
      </div>
    </div>
  );
}
