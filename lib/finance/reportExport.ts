/**
 * Spec Finance, stage N3 — the financial report artifact. The renderer and
 * its line types moved to lib/reports/renderHtml.ts at Spec Impact I2
 * (decision 2: Finance and Impact share the machinery, not the screen);
 * re-exported here so every N3 importer — and the exported HTML — is
 * untouched, byte for byte. Only the artifact vocabulary stays fin-local.
 */

export const ARTIFACT_TYPE = "fin_report";

export {
  renderReportHtml,
  type ReportMetricLine,
  type ReportWaiverLine,
} from "@/lib/reports/renderHtml";
