import { getMetricCatalog } from "@/lib/admin/metrics/catalog";
import { metricRenderState, type MetricFlag } from "@/lib/admin/metrics/render";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * Spec A, stage A5 — the shared metric primitive (Contract 2, "render
 * blocking"). A number reaches the screen ONLY through a defined metric_key:
 * an undefined key renders a refusal chip, never a bare figure. This is the
 * contract's teeth, and it lives here — in Spec A — not in each destination.
 *
 * Contract 7 rule 1: drafting is never blocked. A DEFINED metric always
 * renders — value, or an honest em-dash when no snapshot exists — with its
 * flags inline at the point where the number appears ("blocks export" for
 * conflict/stale, an unconfirmed marker, no-resolver, stale value). Blocking
 * happens only at the exit, via lib/admin/metrics/exportGate.
 *
 * Server component; reads the org's catalog through the session client
 * (metrics.read RLS), so it can never render another org's number.
 */

function FlagChip({ flag }: { flag: MetricFlag }) {
  if (flag.flag === "blocks-export") {
    return (
      <span
        className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-heading font-semibold uppercase tracking-wide text-red-700"
        title={
          flag.reason === "conflict"
            ? "This metric's definition is contested (confirmed_state: conflict). It renders in drafts but blocks export until resolved or waived."
            : "This metric's definition is marked stale (confirmed_state: stale). It renders in drafts but blocks export until resolved or waived."
        }
      >
        blocks export
      </span>
    );
  }
  if (flag.flag === "unconfirmed") {
    return (
      <span
        className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-heading font-semibold uppercase tracking-wide text-amber-700"
        title="This metric's definition has not been confirmed. It renders and exports, flagged."
      >
        unconfirmed
      </span>
    );
  }
  if (flag.flag === "no-resolver") {
    return (
      <span
        className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-heading font-semibold uppercase tracking-wide text-red-700"
        title="Computed definition with no registered resolver — this value can never refresh (register one in METRIC_RESOLVERS or set the definition to manual)."
      >
        no resolver
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center rounded-full bg-gray-light px-2 py-0.5 text-[10px] font-heading font-semibold uppercase tracking-wide text-ink-2"
      title="The latest snapshot is older than this metric's cadence allows."
    >
      stale value
    </span>
  );
}

export default async function Metric({
  metricKey,
  showName = false,
}: {
  metricKey: string;
  /** Render the definition's name next to the value (off by default — most
   *  call sites already carry their own label). */
  showName?: boolean;
}) {
  const catalog = await getMetricCatalog();
  const state = metricRenderState(catalog, metricKey);

  if (state.kind === "undefined") {
    // The refusal: no definition row, no number. Loud on purpose — a screen
    // showing this chip has a missing Contract 2 definition, not a bug here.
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-heading font-semibold text-red-700"
        title={`No metric_definitions row for "${metricKey}" in this org. Define the metric (Contract 2) before rendering it.`}
      >
        undefined metric: {metricKey}
      </span>
    );
  }

  return (
    <span className="inline-flex items-baseline gap-1.5">
      {showName && <span className={TYPE.metadata}>{state.name}</span>}
      <span className="font-heading font-semibold tabular-nums text-ink-1">
        {state.display ?? "—"}
      </span>
      {state.flags.map((f) => (
        <FlagChip key={f.flag} flag={f} />
      ))}
    </span>
  );
}
