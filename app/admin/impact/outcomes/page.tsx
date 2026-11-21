import Link from "next/link";
import EmptyState from "@/app/admin/_components/EmptyState";
import { getMetricCatalog, staleAfter, type CatalogMetric } from "@/lib/admin/metrics/catalog";
import MetricFigure from "@/app/admin/_components/MetricFigure";
import PageHeader from "@/app/admin/_components/PageHeader";
import PageShell from "@/app/admin/_components/ui/PageShell";
import Button from "@/app/admin/_components/ui/Button";
import Figure, { SummaryStrip } from "@/app/admin/_components/ui/Figure";
import { confirmLabel, metricSource } from "@/lib/impact/metricDisplay";

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

  const now = new Date();
  const confirmed = outcomes.filter((m) => m.confirmed_state === "confirmed").length;
  const flagged = outcomes.filter((m) => m.confirmed_state === "conflict" || m.confirmed_state === "stale").length;
  const never = outcomes.filter((m) => !m.latest).length;

  // V4 Stage G2: the Dashboard archetype for provenance. A summary strip of
  // how trustworthy the set is, then one MetricFigure per outcome: the number
  // through the catalog (missing reads "No data yet", never 0), its source
  // line, and a plain word when it is not confirmed.
  return (
    <PageShell>
      <PageHeader
        title="Outcomes"
        subtitle="What the program changed, with each number's origin on its sleeve: where it came from, when it was captured, and whether it can be stood behind."
        primaryAction={<Button href="/admin/impact/kpis">Update values</Button>}
        moreActions={[
          { label: "Build an impact report", href: "/admin/impact/reports" },
          { label: "Metric Catalog", href: "/admin/impact/kpis" },
        ]}
      />

      {outcomes.length > 0 ? (
        <SummaryStrip label="How far these numbers can be trusted">
          <Figure label="Outcome metrics" value={outcomes.length} source="Program metrics in the catalog, as of now" />
          <Figure label="Confirmed" value={confirmed} source="Checked and stood behind" />
          <Figure
            label="Not confirmed yet"
            value={outcomes.length - confirmed}
            compare={flagged > 0 ? `${flagged} would hold up an export` : undefined}
            compareTone={flagged > 0 ? "danger" : "muted"}
            source="Unconfirmed, in conflict, stale or not classified"
          />
          <Figure label="Never captured" value={never} source="Defined but no value recorded" />
        </SummaryStrip>
      ) : null}

      {outcomes.length === 0 ? (
        <EmptyState
          label="outcome metrics"
          hint={
            <>
              A metric joins this screen by carrying the <span className="font-mono text-xs">program</span> department in the
              Metric Catalog.
            </>
          }
          action={
            <Button variant="secondary" size="sm" href="/admin/impact/kpis">
              Open the Metric Catalog
            </Button>
          }
        />
      ) : (
        <SummaryStrip label="Outcome metrics" minCell={220}>
          {outcomes.map((m) => {
            const c = confirmLabel(m.confirmed_state);
            return (
              <MetricFigure
                  key={m.metric_key}
                  metricKey={m.metric_key}
                  label={m.name}
                  source={metricSource(m, now, fmtDate)}
                  compare={m.confirmed_state === "confirmed" ? undefined : c.label}
                  compareTone={m.confirmed_state === "conflict" || m.confirmed_state === "stale" ? "danger" : "default"}
                  extra={
                    <p className="text-xs text-ink-2">
                      {m.description ? `${m.description} ` : ""}
                      {m.latest ? `Due again after ${staleAfter(m.cadence)} days.` : ""}
                      {m.target != null ? " Target set." : ""}
                    </p>
                  }
                />
            );
          })}
        </SummaryStrip>
      )}

      <p className="text-xs text-ink-2 max-w-reading mt-6">
        Values update on{" "}
        <Link href="/admin/impact/kpis" className="font-semibold underline underline-offset-2">
          KPIs
        </Link>
        , which owns the catalog&apos;s update flow. A metric in conflict or stale still shows here; drafting is never
        blocked, but no report ships it without a waiver.
      </p>
    </PageShell>
  );
}
