/**
 * Spec Impact, stage I2 — the impact report artifact vocabulary. The
 * renderer is shared (lib/reports/renderHtml.ts, decision 2); only the
 * artifact type is Impact's own: documents.doc_type, entity_types row, and
 * export_waivers.artifact_type all speak this string.
 */

export const ARTIFACT_TYPE = "impact_report";

export {
  renderReportHtml,
  type ReportMetricLine,
  type ReportWaiverLine,
} from "@/lib/reports/renderHtml";
