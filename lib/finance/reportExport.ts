/**
 * Spec Finance, stage N3 — the report artifact. PURE (the export route feeds
 * it live data; tests feed it fixtures).
 *
 * The exported file is a self-contained, print-friendly HTML one-pager. Two
 * honesty rules are baked into the rendering rather than left to the caller:
 * every value carries its captured-on date (a number with no date is a
 * pretend-live number), and every waiver the artifact shipped under is
 * printed INTO the document — Contract 7 says the waiver travels with the
 * artifact, and a funder holding the file must be able to see it.
 */

export const ARTIFACT_TYPE = "fin_report";

export type ReportMetricLine = {
  key: string;
  name: string;
  value: number | null;
  capturedOn: string | null;
  unit: string | null;
  /** 'conflict' | 'stale' | 'unconfirmed' | null — printed as-is. */
  flag: string | null;
};

export type ReportWaiverLine = {
  metricKey: string | null;
  reason: string | null;
  waivedAt: string; // ISO
};

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function fmtValue(m: ReportMetricLine): string {
  if (m.value === null) return "—";
  const v = Number.isInteger(m.value) ? m.value.toLocaleString("en-US") : m.value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return m.unit === "%" ? `${v}%` : m.unit ? `${v} ${esc(m.unit)}` : v;
}

export function renderReportHtml(input: {
  title: string;
  orgName: string;
  generatedOn: string; // YYYY-MM-DD
  metrics: ReportMetricLine[];
  narrative: string | null;
  waivers: ReportWaiverLine[];
}): string {
  const rows = input.metrics
    .map(
      (m) => `      <tr>
        <td>${esc(m.name)}</td>
        <td class="v">${fmtValue(m)}</td>
        <td class="d">${m.capturedOn ? `as of ${esc(m.capturedOn)}` : "never captured"}${
          m.flag ? ` · <strong>${esc(m.flag)}</strong>` : ""
        }</td>
      </tr>`,
    )
    .join("\n");

  const waiverBlock =
    input.waivers.length === 0
      ? ""
      : `    <section class="waivers">
      <h2>Shipped with waivers (Contract 7)</h2>
      <ul>
${input.waivers
  .map(
    (w) =>
      `        <li>${w.metricKey ? `<strong>${esc(w.metricKey)}</strong>: ` : ""}${
        w.reason ? esc(w.reason) : "no reason recorded"
      } <em>(waived ${esc(w.waivedAt.slice(0, 10))}, reports.approve)</em></li>`,
  )
  .join("\n")}
      </ul>
    </section>\n`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${esc(input.title)}</title>
    <style>
      body { font-family: Georgia, serif; color: #1a1a1a; max-width: 46rem; margin: 2rem auto; padding: 0 1rem; }
      h1 { font-size: 1.6rem; margin-bottom: 0.2rem; }
      .meta { color: #666; font-size: 0.85rem; margin-bottom: 1.6rem; }
      table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
      td { padding: 0.45rem 0.5rem; border-bottom: 1px solid #ddd; font-size: 0.95rem; }
      td.v { text-align: right; font-weight: 700; white-space: nowrap; }
      td.d { color: #666; font-size: 0.8rem; white-space: nowrap; }
      .narrative { white-space: pre-wrap; line-height: 1.55; }
      .waivers { margin-top: 2rem; border-top: 2px solid #1a1a1a; padding-top: 0.8rem; }
      .waivers h2 { font-size: 0.95rem; }
      .waivers li { font-size: 0.85rem; margin-bottom: 0.3rem; }
    </style>
  </head>
  <body>
    <h1>${esc(input.title)}</h1>
    <p class="meta">${esc(input.orgName)} · generated ${esc(input.generatedOn)} · BloomOS</p>
${input.narrative ? `    <p class="narrative">${esc(input.narrative)}</p>\n` : ""}    <table>
${rows}
    </table>
${waiverBlock}  </body>
</html>
`;
}
