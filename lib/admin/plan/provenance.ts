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

// Source of truth for the seeded 2026–27 (v3) manual measures (metric_key →
// where it really lives). Keep keys in sync with the OGSM seed.
const MANUAL_SOURCE: Record<string, string> = {
  // Money measures that can be flipped to manual (their auto twins live in
  // metrics.ts; kpiProvenance branches on the KPI row's source column).
  dollars_raised_fy26: "Gifts received this fiscal year · Finance",
  cash_runway_months: "Cash on hand ÷ monthly burn · Finance",
  weighted_pipeline_fy26: "Open pipeline × probability · CRM",
  // Objective 1 — platform
  web_platform_shipped: "Web school platform shipped · Product",
  sites_on_web_platform: "Sites live on the web platform · Product",
  cross_login_shipped: "Unified web + mobile login shipped · Product",
  exposure_ship_in_production: "Exposure Ship format live in production · Product",
  careers_in_catalog: "Approved careers live in the catalog · Curriculum pipeline",
  days_to_produce_unit: "Per-unit turnaround from the curriculum pipeline log · Product",
  careers_exposed_per_teen: "Careers exposed per active teen · Program",
  unit_completion_rate: "Unit completions ÷ starts · Product analytics",
  // Objective 2 — sites
  active_teens_2x_week: "Students active twice a week · Program",
  partners_2x_week: "Partners running twice a week · Partnerships",
  sponsored_schools_live: "Sponsored schools running · Partnerships",
  program_partners_live: "Program partners running · Partnerships",
  teens_completed_one_unit: "Teens with at least one completed unit · Product analytics",
  adults_active_weekly: "Adult Guide dashboard weekly actives · Product analytics",
  partners_with_mou: "Signed MOUs / data agreements · Partnerships",
  epaa_agreement_signed: "Signed EPAA agreement on file · Compliance",
  // Objective 3 — Ambition Coach
  ambition_plans_completed: "Completed five-part plans delivered to adult guides · Coach program",
  coaches_trained: "Coaches vetted, background-checked, and trained · Coach program",
  application_match_rate: "Matches ÷ applications per matching window · Coach program",
  days_to_first_session: "Application date to first session date · Coach program",
  verdict_split_reported: "Verdict split (validated / adjacent / not it) reported · Coach program",
  followthrough_90day: "90-day follow-up on plan action one · Coach program",
  coach_return_rate: "Coaches returning for another cohort · Coach program",
  // Objective 4 — EPAA result
  students_baseline_collected: "FOS baseline coverage at EPAA · Program survey",
  fos_lift: "Future Orientation Score lift · Program survey",
  deeply_engaged_with_adult: "Engaged teens with a connected adult · Program",
  schools_renewal_intent: "Written renewal-intent statements on file · Partnerships",
  // Objective 5 — fundraising
  floor_source_foundations: "Campaign channel target: institutional grants · Finance",
  floor_source_individual: "Campaign channel target: individual and major gifts · Finance",
  floor_source_sponsorships: "Campaign channel target: school and program sponsorships · Finance",
  floor_source_corporate: "Campaign channel target: corporate · Finance",
  aig_multiyear_commitments: "Multi-year individual pledges logged · CRM",
  donor_meetings_per_month: "Donor meetings logged in BloomOS · CRM",
  donor_updates_sent_ytd: "Donor updates sent this plan year (hand-tallied; the auto counter is calendar-YTD) · Comms",
  // Objective 6 — organization
  partner_success_hired: "Signed offer / start date · Ops",
  partner_success_sites: "Sites carried by Partner Success · Ops",
  hours_per_school: "Delivery hours tracked per school · Ops",
  board_fundraising_assignments: "Campaign assignments per board member · Governance",
  board_giving_participation: "Board gifts on file this fiscal year · Governance",
  board_intros: "Board-sourced introductions logged · CRM",
  compliance_on_time: "Compliance items on time · Governance",
  coach_background_checks: "Background check vendor reports · Compliance",
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
