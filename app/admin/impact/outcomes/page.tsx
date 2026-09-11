import Link from "next/link";
import EmptyState from "@/app/admin/_components/EmptyState";
import { getMetricCatalog, staleAfter, type CatalogMetric } from "@/lib/admin/metrics/catalog";
import Metric from "@/app/admin/_components/Metric";
import PageHeader from "@/app/admin/_components/PageHeader";

// Spec Impact I1 — Outcomes, the destination's landing. The recon's own
// brief: "population-and-provenance framing over numbers that today arrive
// by hand" — so provenance IS the screen, not the fine print. The outcomes
// set is the catalog's `program`-department slice (decision 1, resolved:
// no schema change, new outcome metrics join by setting their department).
// Every value renders through the <Metric> primitive (Contract 2's teeth —
// no bare figure, flags inline), and each row states where its number came
// from: entered by hand or computed, captured when, fresh for its cadence
// or not. Absent data reads as absent (the spec's first failure mode is a
// faked bind). Reads only; the update flow stays on KPIs, which owns it.
export const dynamic = "force-dynamic";

function fmtDate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** conflict/stale first (they block export — the reader should meet them
 *  first), then unconfirmed/unclassified, confirmed last; name breaks ties. */
function provenanceOrder(m: CatalogMetric): number {
  if (m.confirmed_state === "conflict" || m.confirmed_state === "stale") return 0;
  if (m.confirmed_state === "unconfirmed" || m.confirmed_state === null) return 1;
  return 2;
}

export default async function OutcomesPage() {
  const catalog = await getMetricCatalog();
  const outcomes = catalog
    .filter((m) => m.department === "program" && m.active)
    .sort((a, b) => provenanceOrder(a) - provenanceOrder(b) || a.name.localeCompare(b.name));

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1100px] space-y-6">
      <PageHeader
        title="Outcomes"
        subtitle="What the program changed, with each number's origin on its sleeve. Where it came from, when it was captured, and whether it can be stood behind."
      />

      {outcomes.length === 0 ? (
        <EmptyState
          label="outcome metrics"
          hint={
            <>
              A metric joins this screen by carrying the{" "}
              <span className="font-mono text-[12px]">program</span> department in the Metric
              Catalog.
            </>
          }
          action={
            <Link href="/admin/impact/kpis" className="text-xs font-semibold text-orange hover:text-orange-dark">
              Open the Metric Catalog →
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {outcomes.map((m) => (
            <section
              key={m.metric_key}
              className="rounded-card border-[1.5px] border-outline bg-surface shadow-panel px-5 py-4"
            >
              {/* The number itself — only ever through the primitive. */}
              <Metric metricKey={m.metric_key} showName />
              {m.description && (
                <p className="mt-1 text-[12px] text-ink-2 max-w-2xl">{m.description}</p>
              )}
              {/* Provenance line: the point of the screen. */}
              <p className="mt-2 text-[11px] text-ink-3">
                {m.source_kind === "manual" ? "Entered by hand" : "Computed"}
                {" · "}
                {m.latest
                  ? `captured ${fmtDate(m.latest.captured_on)}`
                  : "never captured"}
                {" · "}
                {m.cadence} cadence
                {m.latest && ` (due after ${staleAfter(m.cadence)} days)`}
                {m.target != null && (
                  <>
                    {" · "}
                    <span className="text-ink-2">target set</span>
                  </>
                )}
              </p>
            </section>
          ))}
        </div>
      )}

      <p className="text-[11px] text-ink-3 max-w-2xl">
        Values update on{" "}
        <Link href="/admin/impact/kpis" className="text-orange hover:text-orange-dark font-medium">
          KPIs
        </Link>
        , which owns the catalog&apos;s update flow. A metric flagged{" "}
        <span className="font-semibold">blocks export</span> still renders here. Drafting is
        never blocked, but no report ships it without a waiver (Contract 7).
      </p>
    </div>
  );
}
