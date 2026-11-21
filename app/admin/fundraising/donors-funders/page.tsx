import Link from "next/link";
import EmptyState from "../../_components/EmptyState";
import PageHeader from "../../_components/PageHeader";
import FilterTabs from "../_components/FilterTabs";
import DataTable, { type DataTableColumn } from "../../_components/ui/DataTable";
import TableSavedViews from "../../_components/ui/TableSavedViews";
import { money } from "../../finance/_components/charts";
import {
  getDonorsFunders,
  DF_TABLE,
  DF_PROSPECT_TABLE,
  type DfRow,
  type ProspectRow,
} from "@/lib/admin/donorsFunders";
import { parseTableState, tableHref, type TableSpec, type TableState } from "@/lib/admin/dataTable";
import { constituentName } from "@/lib/fundraising/display";
import {
  BUILT_IN_VIEWS,
  RESEARCH_VIEWS,
  definitionToParams,
  isLapsed,
  toDefinition,
} from "@/lib/fundraising/views";
import { hasEntitlement } from "@/lib/admin/entitlements";
import { getTermLabel, pluralizeTerm } from "@/lib/admin/terminology";
import ResearchDrawer from "./_components/ResearchDrawer";
import { RecordGiftButton } from "../_components/gift/GiftButtons";
import { todayISO } from "../../ops/_types/ops";
import { getOrgContext, ctxHasPermission } from "@/lib/admin/auth";
import { getActiveOrgMembers } from "@/lib/admin/owners-server";
import { ownerLabel, ownerOptions, type OrgMember } from "@/lib/admin/owners";
import type { DataTableBulkAction } from "@/lib/admin/dataTable";

// Spec Fundraising, stage F1 — Donors & Funders: ONE people-list over
// constituents (spec §The one-list rule). Prospects/Recurring/Lapsed are
// views of the list, not screens; saved views are R11's segments-backed
// named filters. Reachable by URL only until F6 — the tab still resolves to
// the V1 donors page (its merge seat) and no redirect exists yet.
//
// Row links open the Donor 360 (donors-funders/[id], built at F2) — one URL
// shape for both id spaces; the F6 308s will carry stored V1 detail URLs to
// the same place.
export const dynamic = "force-dynamic";

const BASE = "/admin/fundraising/donors-funders";

function fmtDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "—";
}

export default async function DonorsFundersPage({
  searchParams,
}: {
  searchParams?: Record<string, string | undefined>;
}) {
  const def = toDefinition(searchParams ?? {});
  // The research views keep V1's fence: the bench section is gated
  // ai.prospect_research, so Prospects and Promoted (R1's saved view of
  // promoted prospects, F4) are too — an org without the key never sees
  // either pill, and a forced URL degrades to All. The same key gates the
  // R1 drawer below.
  const researchEnabled = await hasEntitlement("ai.prospect_research");
  // The volunteers pill speaks the org's vocabulary (Spec Programs P3) —
  // the same getTermLabel the V1 /admin/fundraising/volunteers page used,
  // so YL EPA keeps reading "Leaders" after the P4 308.
  const volunteersLabel = pluralizeTerm(await getTermLabel("volunteer", "Volunteer"));
  if (def.view && RESEARCH_VIEWS.has(def.view) && !researchEnabled) delete def.view;
  const drawerOpen = researchEnabled && searchParams?.drawer === "research";
  // DataTable v2 (V4 Stage A): page and sort come from the URL through the
  // table spec; the Prospects view has its own fixed order.
  const spec: TableSpec = def.view === "prospects" ? DF_PROSPECT_TABLE : DF_TABLE;
  const state = parseTableState(searchParams ?? {}, spec);
  const page = state.page;
  const today = todayISO();
  const [data, ctx, members] = await Promise.all([
    getDonorsFunders(def, page, today, state.sort),
    getOrgContext(),
    getActiveOrgMembers(),
  ]);
  // V4 B2: "Assign to…" for people who may write fundraising records.
  const canAssign = ctx ? await ctxHasPermission(ctx, "fundraising.write") : false;
  const bulkActions: DataTableBulkAction[] = canAssign
    ? [
        {
          kind: "choose",
          key: "assign",
          label: "Assign to…",
          url: "/api/admin/assign/constituents",
          field: "owner_id",
          options: ownerOptions(members, ctx?.userId),
          success: "Assigned to {label}",
        },
      ]
    : [];

  if (!data) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8">
        <PageHeader title="Donors & Funders" subtitle="Sign in to view constituents." />
      </div>
    );
  }

  const view = data.view;
  const extra: Record<string, string> = {};
  if (def.q) extra.q = def.q;
  if (def.type) extra.type = def.type;
  if (def.min_total) extra.min_total = def.min_total;

  // Every filter param the list carries through its sort and page links.
  const filters: Record<string, string> = { ...extra, ...(view !== "all" ? { view } : {}) };
  const currentParams = definitionToParams(def);

  const typeOptions = [
    { value: "all", label: "Everyone" },
    { value: "person", label: "People" },
    { value: "organization", label: "Organizations" },
  ];

  return (
    <div className="min-h-screen bg-ink">
      <div className="max-w-[1400px] px-4 lg:px-8 py-6 lg:py-8 space-y-5">
        <PageHeader
          title="Donors & Funders"
          subtitle={`${data.total} ${view === "prospects" ? "prospect" : "constituent"}${
            data.total === 1 ? "" : "s"
          } · one list, every relationship`}
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href={`${BASE}/companies`}
                className="text-xs font-semibold text-ink-2 hover:text-ink-1 bg-tile hover:bg-tile border-hairline px-4 py-2 rounded-full transition-colors"
              >
                Companies →
              </Link>
              {researchEnabled ? (
              <Link
                href={`${BASE}?${new URLSearchParams({
                  ...extra,
                  ...(view !== "all" ? { view } : {}),
                  drawer: "research",
                }).toString()}`}
                className="text-xs font-semibold text-ink-2 hover:text-ink-1 bg-tile hover:bg-tile border-hairline px-4 py-2 rounded-full transition-colors"
              >
                Prospect research →
              </Link>
              ) : null}
            </div>
          }
          // V4 B1: the list's one primary action opens the gift drawer; the
          // donor is picked there (GiftFlow.dc.html).
          primaryAction={<RecordGiftButton />}
          moreActions={[
            // V4 B2: gift reports and segment exports were linked only from
            // the old donors list (now a 308).
            { label: "Gift reports and exports", href: "/admin/fundraising/reports" },
            { label: "Import donors and gifts", href: "/admin/settings/imports/donors" },
          ]}
        />

        {/* ── Views + filters (URL-driven, server-rendered) ── */}
        <div className="flex flex-wrap items-center gap-3">
          <FilterTabs
            options={BUILT_IN_VIEWS.filter((v) => researchEnabled || !RESEARCH_VIEWS.has(v.value)).map(
              (v) => ({ value: v.value, label: v.value === "volunteers" ? volunteersLabel : v.label }),
            )}
            current={view}
            paramKey="view"
            basePath={BASE}
            extraParams={extra}
          />
          <FilterTabs
            options={typeOptions}
            current={def.type ?? "all"}
            paramKey="type"
            basePath={BASE}
            extraParams={{ ...(view !== "all" ? { view } : {}), ...(def.q ? { q: def.q } : {}), ...(def.min_total ? { min_total: def.min_total } : {}) }}
            size="sm"
          />
          <form action={BASE} method="get" className="flex items-center gap-2">
            {view !== "all" && <input type="hidden" name="view" value={view} />}
            {def.type && <input type="hidden" name="type" value={def.type} />}
            <input aria-label="Search names"
              type="search"
              name="q"
              defaultValue={def.q ?? ""}
              placeholder="Search names…"
              className="text-xs bg-tile border-hairline rounded-full px-3 py-1.5 text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-orange w-48"
            />
          </form>
        </div>

        <TableSavedViews
          endpoint="/api/admin/segments"
          definition={def as Record<string, string>}
          views={data.savedViews.map((sv) => {
            const params = definitionToParams(toDefinition(sv.definition));
            return {
              id: sv.id,
              name: sv.name,
              href: params ? `${BASE}?${params}` : BASE,
              active: params !== "" && params === currentParams,
            };
          })}
        />

        {view === "prospects" ? (
          <ProspectsTable prospects={data.prospects} total={data.total} page={page} spec={spec} state={state} filters={filters} />
        ) : view === "mine" && data.total === 0 && !data.error ? (
          <EmptyState
            label="donors assigned to you"
            hint="Donors you own show up here. Open a donor and set yourself as owner, or select donors on All and use Assign to…"
            action={
              <Link href={BASE} className="text-xs font-semibold text-orange hover:text-orange-dark">
                See all donors and funders →
              </Link>
            }
          />
        ) : view === "all" && !def.q && !def.type && !def.min_total && data.total === 0 && !data.error ? (
          // The true first run — no rows in the org, not a filtered-to-zero
          // view (Q5: name the missing thing, offer the creating action).
          <EmptyState
            label="constituents"
            hint="Every donor, funder, and contact lives on this one list. Record a gift and its donor appears automatically, or bring your history in at once."
            action={
              <Link href="/admin/settings/imports/donors" className="text-xs font-semibold text-orange hover:text-orange-dark">
                Import donors and gifts (CSV) →
              </Link>
            }
          />
        ) : (
          <ConstituentsTable
            rows={data.rows}
            total={data.total}
            page={page}
            error={data.error}
            today={today}
            spec={spec}
            state={state}
            filters={filters}
            members={members}
            bulkActions={bulkActions}
          />
        )}

        {/* The R1 drawer (F4): full-height, URL-driven, entitlement-gated. */}
        {drawerOpen && (
          <ResearchDrawer
            searchParams={{ show: searchParams?.show }}
            closeHref={tableHref(BASE, filters, state, spec)}
          />
        )}

        <p className="text-xs text-ink-3 px-1 leading-relaxed max-w-4xl">
          <span className="font-semibold text-ink-2">Where this comes from:</span> one row
          per constituent, with lifetime giving from gifts, last touch from logged
          interactions, and the next move from the nearest open ask. Prospects without a
          constituent record appear only in the Prospects view; once promoted they join
          the list as one row. Lapsed is computed: gave in a prior year, nothing this
          year, never a stored flag.
        </p>
      </div>
    </div>
  );
}

type TableProps = { total: number; page: number; spec: TableSpec; state: TableState; filters: Record<string, string> };

const badge = "text-xs font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wider";
const num = "[font-variant-numeric:tabular-nums]";

function ConstituentsTable({
  rows,
  today,
  error,
  total,
  page,
  spec,
  state,
  filters,
  members,
  bulkActions,
}: TableProps & { rows: DfRow[]; today: string; error: string | null; members: OrgMember[]; bulkActions: DataTableBulkAction[] }) {
  const columns: DataTableColumn<DfRow>[] = [
    {
      key: "name",
      header: "Name",
      card: "title",
      render: (r) => {
        const lapsed = isLapsed(r.last_gift, r.gift_count, today);
        return (
          <>
            <Link
              href={`/admin/fundraising/donors-funders/${r.id}`}
              className="font-semibold text-ink-1 hover:text-orange transition-colors"
            >
              {constituentName(r)}
            </Link>
            <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
              {r.type === "organization" && (
                <span className={`${badge} bg-tile border border-hairline text-ink-3`}>Org</span>
              )}
              {r.recurring_active && <span className={`${badge} bg-revenue-bg text-revenue`}>Recurring</span>}
              {lapsed && <span className={`${badge} bg-status-watch-bg text-status-watch-text`}>Lapsed</span>}
              {r.do_not_contact && <span className={`${badge} bg-expense-bg text-expense`}>DNC</span>}
            </span>
          </>
        );
      },
    },
    {
      key: "lifetime",
      header: "Lifetime",
      align: "right",
      className: `font-semibold text-ink-1 ${num}`,
      render: (r) => (r.gift_count > 0 ? money(r.lifetime_total) : "—"),
    },
    {
      key: "gifts",
      header: "Gifts",
      align: "right",
      className: `text-ink-2 ${num}`,
      render: (r) => (r.gift_count > 0 ? r.gift_count : "—"),
    },
    { key: "last_gift", header: "Last gift", className: `text-ink-2 ${num}`, render: (r) => fmtDate(r.last_gift) },
    { key: "last_touch", header: "Last touch", className: `text-ink-2 ${num}`, render: (r) => fmtDate(r.last_touch) },
    {
      key: "owner",
      header: "Owner",
      className: "text-ink-2",
      render: (r) => ownerLabel(r.owner_id, members) ?? <span className="text-ink-3">Unassigned</span>,
    },
  ];

  return (
    <DataTable
      label="Constituents"
      noun={{ one: "constituent", many: "constituents" }}
      columns={columns}
      // The next-step slot carries the sortable "next" key: it orders by the
      // nearest open ask's due date.
      nextStep={{
        header: "Next move",
        sortKey: "next",
        render: (r) => {
          if (!r.next_step) return <span className="text-ink-3">—</span>;
          const overdue = r.next_step_due !== null && r.next_step_due < today;
          return (
            <>
              <span className="truncate block">{r.next_step}</span>
              {r.next_step_due && (
                <span className={`text-xs ${overdue ? "text-expense font-semibold" : "text-ink-3"} ${num}`}>
                  {overdue ? "overdue · " : "due "}
                  {fmtDate(r.next_step_due)}
                </span>
              )}
            </>
          );
        },
      }}
      data={{ rows, total, page, pageSize: spec.pageSize, error }}
      getRowId={(r) => r.id}
      getRowLabel={(r) => constituentName(r)}
      spec={spec}
      state={state}
      baseHref={BASE}
      filters={filters}
      bulkActions={bulkActions}
      emptyMessage="No constituents match this view."
    />
  );
}

function ProspectsTable({ prospects, total, page, spec, state, filters }: TableProps & { prospects: ProspectRow[] }) {
  const columns: DataTableColumn<ProspectRow>[] = [
    {
      key: "name",
      header: "Prospect",
      card: "title",
      render: (p) => (
        <>
          <Link
            href={`/admin/fundraising/donors-funders/${p.id}`}
            className="font-semibold text-ink-1 hover:text-orange transition-colors"
          >
            {p.name}
          </Link>
          {p.org_name && <span className="ml-2 text-xs text-ink-3">{p.org_name}</span>}
        </>
      ),
    },
    { key: "type", header: "Type", className: "text-ink-2 capitalize", render: (p) => p.type },
    { key: "email", header: "Email", className: "text-ink-2", render: (p) => p.email ?? "—" },
    {
      key: "note",
      header: "Strategy note",
      className: "text-ink-2 max-w-[320px]",
      render: (p) => <span className="truncate block">{p.strategy_note ?? "—"}</span>,
    },
    { key: "source", header: "Source", className: "text-ink-3 capitalize", render: (p) => p.source },
  ];
  return (
    <DataTable
      label="Prospects"
      noun={{ one: "prospect", many: "prospects" }}
      columns={columns}
      data={{ rows: prospects, total, page, pageSize: spec.pageSize }}
      getRowId={(p) => p.id}
      getRowLabel={(p) => p.name}
      spec={spec}
      state={state}
      baseHref={BASE}
      filters={filters}
      emptyMessage="No active prospects. Promoted prospects live in the main list; disqualified ones are archived with their reason."
    />
  );
}
