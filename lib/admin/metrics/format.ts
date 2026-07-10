/**
 * Metric value formatting — one formatter for every surface that renders a
 * catalog value (the /admin/kpis hub, the weekly digest's KPI block, …), so
 * a metric never reads "$5,000" on one page and "5000 usd" on another.
 * Pure; unit vocabulary matches metric_definitions.unit.
 */
export function fmtMetricValue(unit: string | null, v: number): string {
  if (unit === "usd")
    return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  if (unit === "pct") return `${Math.round(v * 10) / 10}%`;
  if (unit === "months") return `${Math.round(v * 10) / 10} mo`;
  if (unit === "boolean") return v >= 1 ? "Yes" : "No";
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}
