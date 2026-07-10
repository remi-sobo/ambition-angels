import { getMetricCatalog, staleAfter, type CatalogMetric } from "@/lib/admin/metrics/catalog";
import { fmtMetricValue as fmtValue } from "@/lib/admin/metrics/format";
import { getDisplayNames } from "@/lib/admin/profile";
import PageHeader from "../_components/PageHeader";
import StatCard from "../_components/StatCard";
import FilterTabs from "../fundraising/_components/FilterTabs";
import Spark from "./_components/Spark";
import MetricUpdateForm from "./_components/MetricUpdateForm";

export const dynamic = "force-dynamic";

// /admin/kpis — the Metric Catalog hub (spec #3, Phase 4). One place that
// says: this metric exists, this is its number and target, this person owns
// it, and it was last updated N days ago. Reads through the session client
// (metrics.read RLS — board_viewer included, open decision D). Manual metrics
// get an inline update flow; computed ones are captured by the daily cron and
// read-only here. This page replaced the kpi_settings/kpi_snapshots
// scorecard, retired in Phase 5.

const DEPARTMENTS = ["finance", "fundraising", "program", "ops", "strategy"] as const;

function ageDays(capturedOn: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(capturedOn + "T00:00:00Z").getTime()) / 86_400_000));
}

function FreshnessBadge({ m }: { m: CatalogMetric }) {
  if (!m.latest) {
    return (
      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-expense-bg text-expense whitespace-nowrap">
        Never updated
      </span>
    );
  }
  const age = ageDays(m.latest.captured_on);
  if (m.stale) {
    return (
      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-expense-bg text-expense whitespace-nowrap">
        Stale · {age}d
      </span>
    );
  }
  return (
    <span
      className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-revenue-bg text-revenue whitespace-nowrap"
      title={`${m.cadence} cadence — due after ${staleAfter(m.cadence)} days`}
    >
      {age === 0 ? "Today" : `${age}d ago`}
    </span>
  );
}

function TargetCell({ m }: { m: CatalogMetric }) {
  if (m.target == null) return <span className="text-ink-3">—</span>;
  const v = m.latest?.value ?? null;
  const met = v != null && (m.direction === "up" ? v >= m.target : v <= m.target);
  return (
    <span className={met ? "text-revenue font-semibold" : "text-ink-2"}>
      {fmtValue(m.unit, m.target)}
      {met && " ✓"}
    </span>
  );
}

export default async function KpisPage({
  searchParams,
}: {
  searchParams?: { dept?: string; view?: string };
}) {
  const catalog = await getMetricCatalog();
  const dept = searchParams?.dept ?? "all";
  const view = searchParams?.view === "stale" ? "stale" : "all";

  const active = catalog.filter((m) => m.active);
  const staleCount = active.filter((m) => m.stale).length;
  const computedCount = active.filter((m) => m.source_kind === "computed").length;

  let rows = active;
  if (dept !== "all") rows = rows.filter((m) => m.department === dept);
  if (view === "stale") rows = rows.filter((m) => m.stale);

  const names = await getDisplayNames(
    Array.from(new Set(rows.map((m) => m.owner_id).filter(Boolean))) as string[],
  );

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1200px]">
      <PageHeader
        title="Metric Catalog"
        subtitle="Every number the org runs on — one definition, one source, one owner, freshness enforced"
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <StatCard label="Active metrics" value={active.length} />
        <StatCard label="Stale (need an update)" value={staleCount} muted={staleCount === 0} />
        <StatCard label="Computed automatically" value={computedCount} sub="daily capture cron" />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <FilterTabs
          options={[
            { value: "all", label: "All" },
            { value: "stale", label: `Stale (${staleCount})` },
          ]}
          current={view}
          paramKey="view"
          basePath="/admin/kpis"
          extraParams={dept !== "all" ? { dept } : {}}
        />
        <FilterTabs
          options={[{ value: "all", label: "All departments" }].concat(
            DEPARTMENTS.map((d) => ({ value: d, label: d.charAt(0).toUpperCase() + d.slice(1) })),
          )}
          current={dept}
          paramKey="dept"
          basePath="/admin/kpis"
          extraParams={view !== "all" ? { view } : {}}
          size="sm"
        />
      </div>

      <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-5 text-sm text-ink-2">
            {view === "stale" ? "Nothing is stale — every metric is inside its cadence." : "No metrics match."}
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {rows.map((m) => (
              <li key={m.id} className="px-5 py-3 flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink-1 truncate" title={m.description ?? undefined}>
                      {m.name}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-3 whitespace-nowrap">
                      {m.department ?? "—"} · {m.source_kind === "computed" ? "auto" : "manual"}
                    </span>
                  </div>
                  <div className="text-[11px] text-ink-3">
                    {m.owner_id ? (names[m.owner_id] ?? "—") : "No owner"} · {m.cadence}
                  </div>
                </div>
                <Spark values={m.history.map((h) => h.value)} className="hidden sm:block shrink-0" />
                <span className="text-sm font-semibold text-ink-1 tabular-nums whitespace-nowrap w-24 text-right">
                  {m.latest ? fmtValue(m.unit, m.latest.value) : "—"}
                </span>
                <span className="text-[12px] tabular-nums whitespace-nowrap w-24 text-right hidden md:inline">
                  <TargetCell m={m} />
                </span>
                <FreshnessBadge m={m} />
                {m.source_kind === "manual" ? (
                  <MetricUpdateForm metricId={m.id} />
                ) : (
                  <span
                    className="text-[11px] text-ink-3 whitespace-nowrap w-[4.5rem] text-right"
                    title="Captured by the daily cron"
                  >
                    auto
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
