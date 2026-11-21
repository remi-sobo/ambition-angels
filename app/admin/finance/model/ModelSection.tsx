import { unstable_cache } from "next/cache";
import { loadFinanceModel } from "@/lib/google/finance-sheet";
import { hasEntitlement } from "@/lib/admin/entitlements";
import PageHeader from "../../_components/PageHeader";
import PageShell from "../../_components/ui/PageShell";
import Figure, { SummaryStrip } from "../../_components/ui/Figure";
import Notice from "../../_components/ui/Notice";
import Button from "../../_components/ui/Button";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * /admin/finance/model — live KPIs from the founder finance model.
 *
 * Read-only. The full model lives in a Google Sheet that contains salaries,
 * so the page renders just the four headline metrics the founder watches at the
 * top of every conversation. Anyone who needs the underlying math opens the
 * sheet directly via the "View full model" link.
 *
 * Auth: gated by the admin cookie via middleware.ts (matcher: /admin/:path+).
 * Data flow: server-side only via lib/google/finance-sheet.ts (service
 * account, read-only scope). Sheet contents never reach the browser except
 * as the four rendered numbers below.
 *
 * Caching: at most one Sheets API call per hour per deployment. Hitting the
 * page right after updating the sheet won't reflect for up to an hour;
 * that's the accepted tradeoff vs hammering Google. The V1 route keeps its
 * revalidate=3600; the embedded render on Forecast (a force-dynamic page)
 * gets the same promise from the unstable_cache wrapper below.
 *
 * Extracted at Spec Finance N2, and FENCED at the same time: the sheet is
 * env-configured with no org in the data path — these are AA's numbers —
 * so both variants render only under aa.finance_model (seeded for AA).
 * Before N2 any finance-holding org could open the V1 page and read them;
 * the absorption would have widened that leak, so it closes here instead.
 */

const loadFinanceModelHourly = unstable_cache(
  async () => loadFinanceModel(),
  ["finance-model-hourly"],
  { revalidate: 3600 },
);

// USD with no cents — matches the rest of /admin/finance where headline
// numbers are integer dollars and only transaction tables show cents.
function money(n: number | null): string | null {
  if (n === null) return null;
  const sign = n < 0 ? "−" : "";
  return `${sign}$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
}

function months(n: number | null): string | null {
  if (n === null) return null;
  return `${n.toFixed(1)} mo`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function ModelSection({ embedded = false }: { embedded?: boolean }) {
  if (!(await hasEntitlement("aa.finance_model"))) return null;
  const status = embedded ? await loadFinanceModelHourly() : await loadFinanceModel();

  // V4 Stage G2: the four numbers through the kit Figure, each sourced to
  // the sheet with its fetch time; a blank cell reads "No data yet".
  const body = (
    <>
      {status.kind === "not_configured" ? (
        <Notice tone="warning" title="The founder model is not connected yet.">
          Set these in the deployment settings: {status.missing.join(", ")}. The Apps Script source is in
          scripts/finance-model-webhook.gs; paste it into the sheet&apos;s Apps Script editor.
        </Notice>
      ) : null}
      {status.kind === "error" ? (
        <Notice tone="danger" title="Could not reach the sheet.">
          Usually the service account has no Viewer access, the spreadsheet id is wrong, or the private key is
          escaped wrong. {status.message}
        </Notice>
      ) : null}
      {status.kind === "ok" ? (
        <>
          <SummaryStrip label="Founder model figures">
            {[
              { label: "Cash balance", value: money(status.data.cashBalance) },
              { label: "Monthly burn", value: status.data.monthlyBurn === null ? null : `${money(status.data.monthlyBurn)} a month` },
              { label: "Runway", value: months(status.data.runwayMonths) },
              { label: "Funding needed to survive", value: money(status.data.fundingNeeded) },
            ].map((f) => (
              <Figure
                key={f.label}
                label={f.label}
                value={f.value}
                source={`From the founder model sheet, fetched ${fmtTime(status.data.fetchedAt)}`}
              />
            ))}
          </SummaryStrip>
          <div className="flex justify-end">
            <Button variant="secondary" size="sm" href={status.data.sheetUrl} target="_blank" rel="noreferrer">
              View full model
            </Button>
          </div>
        </>
      ) : null}
    </>
  );

  if (embedded) {
    return (
      <section className="space-y-3">
        <div>
          <h2 className={TYPE.cardTitle}>Model</h2>
          <p className={`${TYPE.bodyMuted} mt-1`}>The four numbers from the founder model sheet. Refreshes hourly.</p>
        </div>
        {body}
      </section>
    );
  }
  return (
    <PageShell>
      <PageHeader
        title="Model"
        subtitle="The four numbers that decide whether we keep going, from the source-of-truth Google Sheet. Refreshes hourly."
      />
      <div className="space-y-4">{body}</div>
    </PageShell>
  );
}
