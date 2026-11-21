import { getMetricCatalog, staleAfter, type CatalogMetric } from "@/lib/admin/metrics/catalog";
import EmptyState from "../_components/EmptyState";
import { fmtMetricValue as fmtValue } from "@/lib/admin/metrics/format";
import { getDisplayNames } from "@/lib/admin/profile";
import PageHeader from "../_components/PageHeader";
import PageShell from "../_components/ui/PageShell";
import Button from "../_components/ui/Button";
import Badge from "../_components/ui/Badge";
import SegmentedControl from "../_components/ui/SegmentedControl";
import Figure, { SummaryStrip } from "../_components/ui/Figure";
import DataTable, { type DataTableColumn } from "../_components/ui/DataTable";
import { MISSING_TEXT } from "@/lib/admin/figure";
import { confirmLabel, freshnessLabel } from "@/lib/impact/metricDisplay";
import Spark from "./_components/Spark";
import MetricUpdateForm from "./_components/MetricUpdateForm";

export const dynamic = "force-dynamic";

// Impact → KPIs: the Metric Catalog hub, on the List archetype (V4 Stage G2).
// One place that says: this metric exists, this is its number and target,
// this person owns it, it was last updated N days ago, and whether the
// number is confirmed. Reads through the session client (metrics.read RLS,
// board_viewer included). Manual metrics update in the kit Drawer; computed
// ones are captured by the daily cron and read-only here. A metric with no
// snapshot reads "No data yet", never 0; an unconfirmed one says so.

const DEPARTMENTS = ["finance", "fundraising", "program", "ops", "strategy"] as const;
const BASE = "/admin/impact/kpis";
const SPEC = { sortable: [], defaultSort: null, pageSize: 500 } as const;

function targetText(m: CatalogMetric) {
  if (m.target == null) return <span className="text-ink-2">No target</span>;
  const v = m.latest?.value ?? null;
  const met = v != null && (m.direction === "up" ? v >= m.target : v <= m.target);
  return (
    <span className={met ? "text-status-healthy-text font-semibold" : "text-ink-2"}>
      {fmtValue(m.unit, m.target)}
      {met ? " (met)" : ""}
    </span>
  );
}

export default async function KpisPage({
  searchParams,
}: {
  searchParams?: { dept?: string; view?: string };
}) {
  const catalog = await getMetricCatalog();
  const dept = DEPARTMENTS.includes(searchParams?.dept as (typeof DEPARTMENTS)[number]) ? (searchParams?.dept as string) : "all";
  const view = searchParams?.view === "stale" ? "stale" : "all";

  const active = catalog.filter((m) => m.active);
  const staleCount = active.filter((m) => m.stale).length;
  const computedCount = active.filter((m) => m.source_kind === "computed").length;
  const unconfirmedCount = active.filter((m) => m.confirmed_state !== "confirmed").length;

  let rows = active;
  if (dept !== "all") rows = rows.filter((m) => m.department === dept);
  if (view === "stale") rows = rows.filter((m) => m.stale);

  const names = await getDisplayNames(Array.from(new Set(rows.map((m) => m.owner_id).filter(Boolean))) as string[]);
  const href = (v: string, d: string) => {
    const p = new URLSearchParams();
    if (v !== "all") p.set("view", v);
    if (d !== "all") p.set("dept", d);
    const s = p.toString();
    return s ? `${BASE}?${s}` : BASE;
  };

  const columns: DataTableColumn<CatalogMetric>[] = [
    {
      key: "name",
      header: "Metric",
      card: "title",
      render: (m) => (
        <span className="min-w-0">
          <span className="font-semibold text-ink-1" title={m.description ?? undefined}>
            {m.name}
          </span>
          <span className="block text-xs text-ink-2">
            {m.department ? m.department.charAt(0).toUpperCase() + m.department.slice(1) : "No department"} ·{" "}
            {m.source_kind === "computed" ? "computed daily" : "entered by hand"} · {m.cadence}
          </span>
        </span>
      ),
    },
    {
      key: "value",
      header: "Latest",
      align: "right",
      render: (m) =>
        m.latest ? (
          <span className="inline-flex items-center gap-3 justify-end">
            <Spark values={m.history.map((h) => h.value)} className="hidden sm:block shrink-0" />
            <span className="font-semibold text-ink-1 tabular-nums">{fmtValue(m.unit, m.latest.value)}</span>
          </span>
        ) : (
          <span className="text-ink-2">{MISSING_TEXT}</span>
        ),
    },
    { key: "target", header: "Target", align: "right", className: "tabular-nums", render: targetText },
    {
      key: "fresh",
      header: "Freshness",
      render: (m) => {
        const f = freshnessLabel(m, new Date());
        return (
          <Badge tone={f.tone} >
            <span title={`${m.cadence} cadence, due after ${staleAfter(m.cadence)} days`}>{f.label}</span>
          </Badge>
        );
      },
    },
    {
      key: "confirmed",
      header: "Confirmed",
      render: (m) => {
        const c = confirmLabel(m.confirmed_state);
        return <Badge tone={c.tone}>{c.label}</Badge>;
      },
    },
    { key: "owner", header: "Owner", className: "text-ink-2", render: (m) => (m.owner_id ? names[m.owner_id] ?? "Unknown" : "No owner") },
  ];

  return (
    <PageShell>
      <PageHeader
        title="Metric Catalog"
        subtitle="Every number the organization runs on: one definition, one source, one owner, freshness enforced."
        secondaryActions={
          <SegmentedControl
            label="Show"
            segments={[
              { value: "all", label: "All" },
              { value: "stale", label: `Out of date (${staleCount})` },
            ]}
            value={view}
            hrefFor={(v) => href(v, dept)}
          />
        }
        moreActions={[
          { label: "Outcomes", href: "/admin/impact/outcomes" },
          { label: "Impact reports", href: "/admin/impact/reports" },
          { label: "Add measures on the plan", href: "/admin/strategic-plan" },
        ]}
      />

      <SummaryStrip label="Catalog summary">
        <Figure label="Active metrics" value={active.length} source="Defined in this organization's catalog, as of now" />
        <Figure
          label="Out of date"
          value={staleCount}
          compareTone={staleCount > 0 ? "danger" : "muted"}
          compare={staleCount > 0 ? "need an update" : undefined}
          href={staleCount > 0 ? href("stale", dept) : undefined}
          source="Past their cadence without a new value"
        />
        <Figure label="Not confirmed" value={unconfirmedCount} source="Unconfirmed, in conflict, stale or not yet classified" />
        <Figure label="Computed automatically" value={computedCount} source="Captured by the daily job" />
      </SummaryStrip>

      <div className="mb-4">
        <SegmentedControl
          label="Department"
          segments={[{ value: "all", label: "All departments" }].concat(
            DEPARTMENTS.map((d) => ({ value: d, label: d.charAt(0).toUpperCase() + d.slice(1) })),
          )}
          value={dept}
          hrefFor={(d) => href(view, d)}
        />
      </div>

      <DataTable
        label="Metrics"
        noun={{ one: "metric", many: "metrics" }}
        columns={columns}
        nextStep={{
          header: "Next step",
          render: (m) =>
            m.source_kind === "manual" ? (
              <MetricUpdateForm metricId={m.id} metricName={m.name} />
            ) : (
              <span className="text-xs text-ink-2">Captured daily</span>
            ),
        }}
        data={{ rows, total: rows.length, page: 0, pageSize: SPEC.pageSize }}
        getRowId={(m) => m.id}
        getRowLabel={(m) => m.name}
        spec={SPEC}
        state={{ page: 0, sort: null }}
        baseHref={BASE}
        minWidth={900}
        emptyMessage={view === "stale" ? "Nothing is out of date. Every metric is inside its cadence." : "No metrics in this department."}
        empty={
          active.length === 0 ? (
            <div className="p-4">
              <EmptyState
                label="metrics"
                hint="Every number the organization runs on gets one definition, one source, one owner. Measures added on the strategic plan land here."
                action={
                  <Button variant="secondary" size="sm" href="/admin/strategic-plan">
                    Add measures on the plan
                  </Button>
                }
              />
            </div>
          ) : undefined
        }
      />
    </PageShell>
  );
}
