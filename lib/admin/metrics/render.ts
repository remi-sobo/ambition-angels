import { fmtMetricValue } from "./format";

/**
 * Spec A, stage A5 — the render decision behind the shared <Metric> primitive
 * (Contract 2, "render blocking"): a number may only appear on screen when its
 * metric_key has a definition row. This module is PURE — the component feeds
 * it the catalog; tests feed it fixtures — so the contract's teeth are
 * testable without a database.
 *
 * Contract 7 rule 1 shapes the states: DRAFTING IS NEVER BLOCKED. A defined
 * metric always renders (value or an honest "no value"), carrying its flags
 * inline at the point where the number appears; only the EXIT (export / send /
 * approve / close) blocks, and that lives in ./exportGate. The one true
 * refusal is an UNDEFINED key — there is no number to stand behind, so the
 * primitive renders a refusal chip, never a bare figure.
 */

/** The slice of CatalogMetric the decision needs (kept narrow so callers and
 *  tests don't have to build full catalog rows). */
export type MetricRenderInput = {
  metric_key: string;
  name: string;
  unit: string | null;
  confirmed_state: "confirmed" | "unconfirmed" | "conflict" | "stale" | null;
  /** Computed definition with no registered resolver (A4 finding). */
  unresolved: boolean;
  /** Snapshot freshness vs cadence (./staleness) — a DIFFERENT thing from
   *  confirmed_state='stale': freshness says the number is old; the
   *  confirmed_state says the DEFINITION is contested. Only the latter
   *  blocks export. */
  stale: boolean;
  latest: { value: number; captured_on: string } | null;
};

export type MetricFlag =
  /** confirmed_state conflict|stale — renders inline, blocks the exit. */
  | { flag: "blocks-export"; reason: "conflict" | "stale" }
  /** confirmed_state unconfirmed — a marker, never a block. */
  | { flag: "unconfirmed" }
  /** computed with no resolver — the value can never refresh (A4). */
  | { flag: "no-resolver" }
  /** snapshot older than the cadence allows. */
  | { flag: "stale-value" };

export type MetricRenderState =
  /** No definition row for this key: REFUSE. Never render a number. */
  | { kind: "undefined"; key: string }
  /** Defined — always renders. display is the formatted latest value, or
   *  null when no snapshot exists yet (render "—", not a made-up zero). */
  | {
      kind: "defined";
      key: string;
      name: string;
      display: string | null;
      capturedOn: string | null;
      flags: MetricFlag[];
    };

export function metricRenderState(
  catalog: readonly MetricRenderInput[],
  key: string,
): MetricRenderState {
  const def = catalog.find((d) => d.metric_key === key);
  if (!def) return { kind: "undefined", key };

  const flags: MetricFlag[] = [];
  if (def.confirmed_state === "conflict" || def.confirmed_state === "stale") {
    flags.push({ flag: "blocks-export", reason: def.confirmed_state });
  } else if (def.confirmed_state === "unconfirmed") {
    flags.push({ flag: "unconfirmed" });
  }
  if (def.unresolved) flags.push({ flag: "no-resolver" });
  if (def.stale && def.latest) flags.push({ flag: "stale-value" });

  return {
    kind: "defined",
    key,
    name: def.name,
    display: def.latest ? fmtMetricValue(def.unit, def.latest.value) : null,
    capturedOn: def.latest?.captured_on ?? null,
    flags,
  };
}
