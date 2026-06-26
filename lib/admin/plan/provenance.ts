/**
 * KPI provenance — the plain-English "where does this number come from?" for
 * every measure on the scorecard. Client-safe (pure data), so cards can render
 * it without a server round-trip.
 *
 * Two kinds today:
 *   - auto    → computed from the BloomOS spine on refresh (lib/admin/plan/
 *               metrics.ts); the catalog describes the computation.
 *   - manual  → hand-entered, but most 2026 OGSM measures still trace to a real
 *               surface (finance, CRM, program). We name that source of truth so
 *               the operator knows where to look — and which measures are
 *               candidates to wire to live data later (the Strategy Narrative
 *               already computes the money ones from finance).
 */
import { AUTO_METRIC_CATALOG } from "./metricCatalog";

const AUTO = new Map(AUTO_METRIC_CATALOG.map((m) => [m.key, m.description]));

// Source of truth for the seeded 2026 manual measures (metric_key → where it
// really lives). Keep keys in sync with the OGSM seed.
const MANUAL_SOURCE: Record<string, string> = {
  dollars_raised_fy26: "Gifts received this fiscal year · Finance",
  dollars_ceiling_fy26: "Approved budget ceiling · Finance",
  cash_runway_months: "Cash on hand ÷ monthly burn · Finance",
  weighted_pipeline_fy26: "Open pipeline × probability · CRM",
  corporate_raised: "Corporate gifts secured · Finance / CRM",
  aig_multiyear_commitments: "Multi-year AIG pledges logged · CRM",
  active_teens_2x_week: "Students active twice a week · Program",
  partners_2x_week: "Partners running twice a week · Partnerships",
  partners_with_mou: "Signed MOUs / data agreements · Partnerships",
  deeply_engaged_with_adult: "Engaged teens with a connected adult · Program",
  parents_active_dashboard: "Parents with an active dashboard · Product",
  careers_exposed_per_teen: "Careers exposed per active teen · Program",
  coach_teens: "Teens through Ambition Coach · Program",
  fos_lift: "Future Orientation Score lift · Program survey",
  web_platform_shipped: "Web school platform shipped · Product",
  pilot_completed: "Two-school pilot completed · Program",
  hires_made: "Key hires made · Ops",
  compliance_on_time: "Compliance items on time · Governance",
};

export type KpiProvenance = {
  /** "Auto" or "Manual" — the badge word. */
  label: "Auto" | "Manual";
  /** Whether a person edits this value (auto values are computed, not edited). */
  editable: boolean;
  /** One line: the computation (auto) or the source of truth (manual). */
  detail: string;
};

export function kpiProvenance(source: string, metricKey: string | null): KpiProvenance {
  if (source === "auto") {
    const d = (metricKey && AUTO.get(metricKey)) || "Computed from BloomOS data on refresh.";
    return { label: "Auto", editable: false, detail: d };
  }
  const hint = metricKey ? MANUAL_SOURCE[metricKey] : null;
  return {
    label: "Manual",
    editable: true,
    detail: hint ? `Source of truth · ${hint}` : "Hand-entered measure.",
  };
}
