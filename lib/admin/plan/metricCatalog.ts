/**
 * Display catalog for the auto-metric registry (lib/admin/plan/metrics.ts).
 * Pure data, safe to import on the client — the setup wizard's "wire to live
 * data" picker renders these so a tenant can attach a KPI to a real BloomOS
 * number in one click. Keys MUST match PLAN_METRICS in metrics.ts.
 */
export type MetricCatalogEntry = {
  key: string;
  label: string;
  /** Stored on the KPI's unit; "$" renders as currency on the plan. */
  unit: string;
  description: string;
};

export const AUTO_METRIC_CATALOG: MetricCatalogEntry[] = [
  {
    key: "dollars_raised_grants_ytd",
    label: "Grant dollars raised (YTD)",
    unit: "$",
    description: "Sums awarded/active/closed grants this year.",
  },
  {
    key: "grants_submitted_ytd",
    label: "Grants submitted (YTD)",
    unit: "grants",
    description: "Counts grant applications submitted this year.",
  },
  {
    key: "corporate_dollars_ytd",
    label: "Corporate dollars (YTD)",
    unit: "$",
    description: "Secured corporate major gifts (steward stage) this year.",
  },
  {
    key: "donor_updates_sent_ytd",
    label: "Donor updates sent (YTD)",
    unit: "updates",
    description: "Counts sent email campaigns this year.",
  },
  {
    key: "active_teens",
    label: "Active teens",
    unit: "teens",
    description: "Students in an engaged journey stage.",
  },
  {
    key: "dollars_raised_fy26",
    label: "Raised toward the committed floor",
    unit: "$",
    description: "Sums all gifts received this fiscal year (Finance).",
  },
  {
    key: "weighted_pipeline_fy26",
    label: "Weighted pipeline (FY26)",
    unit: "$",
    description: "Open pipeline asks × probability; excludes steward, lost, won (CRM).",
  },
  {
    key: "corporate_raised",
    label: "Corporate raised",
    unit: "$",
    description: "Gifts this fiscal year from organization-type donors (Finance / CRM).",
  },
  {
    key: "cash_runway_months",
    label: "Cash runway (months)",
    unit: "months",
    description: "Cash on hand ÷ monthly burn, from the finance snapshot.",
  },
];
