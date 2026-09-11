import Link from "next/link";
import EmptyState from "../../_components/EmptyState";
import PageHeader from "../../_components/PageHeader";
import FilterTabs from "../_components/FilterTabs";
import SavedViews from "./_components/SavedViews";
import { money } from "../../finance/_components/charts";
import { getDonorsFunders, type DfRow, type ProspectRow } from "@/lib/admin/donorsFunders";
import { constituentName } from "@/lib/fundraising/display";
import { BUILT_IN_VIEWS, RESEARCH_VIEWS, isLapsed, toDefinition } from "@/lib/fundraising/views";
import { hasEntitlement } from "@/lib/admin/entitlements";
import { getTermLabel, pluralizeTerm } from "@/lib/admin/terminology";
import ResearchDrawer from "./_components/ResearchDrawer";
import { todayISO } from "../../ops/_types/ops";
import { TYPE } from "@/lib/admin/typeScale";

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
  const page = Math.max(0, Number.parseInt(searchParams?.page ?? "0", 10) || 0);
  const today = todayISO();
  const data = await getDonorsFunders(def, page, today);

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

  const pageCount = Math.max(1, Math.ceil(data.total / data.pageSize));
  const pageHref = (p: number) => {
    const params = new URLSearchParams({ ...extra, ...(view !== "all" ? { view } : {}) });
    if (p > 0) params.set("page", String(p));
    const s = params.toString();
    return s ? `${BASE}?${s}` : BASE;
  };

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
            researchEnabled ? (
              <Link
                href={`${BASE}?${new URLSearchParams({
                  ...extra,
                  ...(view !== "all" ? { view } : {}),
                  drawer: "research",
                }).toString()}`}
                className="text-xs font-semibold text-ink-2 hover:text-ink-1 bg-tile hover:bg-[#EFE6D4] border-[1.5px] border-outline px-4 py-2 rounded-full transition-colors"
              >
                Prospect research →
              </Link>
            ) : undefined
          }
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
            <input
              type="search"
              name="q"
              defaultValue={def.q ?? ""}
              placeholder="Search names…"
              className="text-xs bg-tile border-[1.5px] border-outline rounded-full px-3 py-1.5 text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-orange w-48"
            />
          </form>
        </div>

        <SavedViews savedViews={data.savedViews} current={def} />

        {data.error && (
          <div className="bg-expense-bg border border-expense/30 rounded-xl px-5 py-3 text-expense text-sm">
            The list failed to load ({data.error}). Reload to retry.
          </div>
        )}

        {view === "prospects" ? (
          <ProspectsTable prospects={data.prospects} />
        ) : view === "all" && !def.q && !def.type && !def.min_total && data.total === 0 ? (
          // The true first run — no rows in the org, not a filtered-to-zero
          // view (Q5: name the missing thing, offer the creating action).
          <EmptyState
            label="constituents"
            hint="Every donor, funder, and contact lives on this one list. Record a gift and its donor appears automatically, or bring your history in at once."
            action={
              <Link href="/admin/fundraising/import" className="text-xs font-semibold text-orange hover:text-orange-dark">
                Import donors and gifts (CSV) →
              </Link>
            }
          />
        ) : (
          <ConstituentsTable rows={data.rows} today={today} />
        )}

        {/* ── Pagination ── */}
        {pageCount > 1 && (
          <div className="flex items-center gap-3 text-xs text-ink-2">
            {page > 0 ? (
              <Link href={pageHref(page - 1)} className="font-semibold text-orange hover:text-orange-dark">
                ← Newer
              </Link>
            ) : (
              <span className="text-ink-3">← Newer</span>
            )}
            <span>
              Page {page + 1} of {pageCount}
            </span>
            {page + 1 < pageCount ? (
              <Link href={pageHref(page + 1)} className="font-semibold text-orange hover:text-orange-dark">
                Older →
              </Link>
            ) : (
              <span className="text-ink-3">Older →</span>
            )}
          </div>
        )}

        {/* The R1 drawer (F4): full-height, URL-driven, entitlement-gated. */}
        {drawerOpen && (
          <ResearchDrawer
            searchParams={{ show: searchParams?.show }}
            closeHref={pageHref(page)}
          />
        )}

        <p className="text-xs text-ink-3 px-1 leading-relaxed max-w-4xl">
          <span className="font-semibold text-ink-2">Where this comes from:</span> one row
          per constituent, with lifetime giving from gifts, last touch from logged
          interactions, and the next move from the nearest open ask. Prospects without a
          constituent record appear only in the Prospects view; once promoted they join
          the list as one row. Lapsed is computed — gave in a prior year, nothing this
          year — never a stored flag.
        </p>
      </div>
    </div>
  );
}

function ConstituentsTable({ rows, today }: { rows: DfRow[]; today: string }) {
  if (rows.length === 0) {
    return (
      <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
        <p className={`p-8 ${TYPE.bodyMuted}`}>No constituents match this view.</p>
      </section>
    );
  }
  return (
    <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-ink-3 border-b border-outline">
            <th className="px-4 py-3 font-semibold">Name</th>
            <th className="px-4 py-3 font-semibold text-right">Lifetime</th>
            <th className="px-4 py-3 font-semibold text-right">Gifts</th>
            <th className="px-4 py-3 font-semibold">Last gift</th>
            <th className="px-4 py-3 font-semibold">Last touch</th>
            <th className="px-4 py-3 font-semibold">Next move</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline">
          {rows.map((r) => {
            const overdue = r.next_step_due !== null && r.next_step_due < today;
            const lapsed = isLapsed(r.last_gift, r.gift_count, today);
            return (
              <tr key={r.id} className="hover:bg-orange/5 transition-colors">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/fundraising/donors-funders/${r.id}`}
                    className="font-semibold text-ink-1 hover:text-orange transition-colors"
                  >
                    {constituentName(r)}
                  </Link>
                  <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                    {r.type === "organization" && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-tile border border-outline text-ink-3 uppercase tracking-wider">
                        Org
                      </span>
                    )}
                    {r.recurring_active && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-revenue-bg text-revenue uppercase tracking-wider">
                        Recurring
                      </span>
                    )}
                    {lapsed && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#F4E8D0] text-[#A56A1B] uppercase tracking-wider">
                        Lapsed
                      </span>
                    )}
                    {r.do_not_contact && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-expense-bg text-expense uppercase tracking-wider">
                        DNC
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-semibold text-ink-1 [font-variant-numeric:tabular-nums]">
                  {r.gift_count > 0 ? money(r.lifetime_total) : "—"}
                </td>
                <td className="px-4 py-3 text-right text-ink-2 [font-variant-numeric:tabular-nums]">
                  {r.gift_count > 0 ? r.gift_count : "—"}
                </td>
                <td className="px-4 py-3 text-ink-2 [font-variant-numeric:tabular-nums]">
                  {fmtDate(r.last_gift)}
                </td>
                <td className="px-4 py-3 text-ink-2 [font-variant-numeric:tabular-nums]">
                  {fmtDate(r.last_touch)}
                </td>
                <td className="px-4 py-3 text-ink-2 max-w-[280px]">
                  {r.next_step ? (
                    <>
                      <span className="truncate block">{r.next_step}</span>
                      {r.next_step_due && (
                        <span
                          className={`text-[11px] ${overdue ? "text-expense font-semibold" : "text-ink-3"} [font-variant-numeric:tabular-nums]`}
                        >
                          {overdue ? "overdue · " : "due "}
                          {fmtDate(r.next_step_due)}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-ink-3">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function ProspectsTable({ prospects }: { prospects: ProspectRow[] }) {
  if (prospects.length === 0) {
    return (
      <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
        <p className={`p-8 ${TYPE.bodyMuted}`}>
          No active prospects. Promoted prospects live in the main list; disqualified
          ones are archived with their reason.
        </p>
      </section>
    );
  }
  return (
    <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-ink-3 border-b border-outline">
            <th className="px-4 py-3 font-semibold">Prospect</th>
            <th className="px-4 py-3 font-semibold">Type</th>
            <th className="px-4 py-3 font-semibold">Email</th>
            <th className="px-4 py-3 font-semibold">Strategy note</th>
            <th className="px-4 py-3 font-semibold">Source</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline">
          {prospects.map((p) => (
            <tr key={p.id} className="hover:bg-orange/5 transition-colors">
              <td className="px-4 py-3">
                <Link
                  href={`/admin/fundraising/donors-funders/${p.id}`}
                  className="font-semibold text-ink-1 hover:text-orange transition-colors"
                >
                  {p.name}
                </Link>
                {p.org_name && <span className="ml-2 text-xs text-ink-3">{p.org_name}</span>}
              </td>
              <td className="px-4 py-3 text-ink-2 capitalize">{p.type}</td>
              <td className="px-4 py-3 text-ink-2">{p.email ?? "—"}</td>
              <td className="px-4 py-3 text-ink-2 max-w-[320px]">
                <span className="truncate block">{p.strategy_note ?? "—"}</span>
              </td>
              <td className="px-4 py-3 text-ink-3 capitalize">{p.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
