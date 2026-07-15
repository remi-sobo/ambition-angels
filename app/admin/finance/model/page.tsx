import { loadFinanceModel } from "@/lib/google/finance-sheet";

/**
 * /admin/finance/model — live KPIs from the founder finance model.
 *
 * Read-only. The full model lives in a Google Sheet that contains salaries,
 * so the page renders just the four headline metrics Remi cares about at the
 * top of every conversation. Anyone who needs the underlying math opens the
 * sheet directly via the "View full model" link.
 *
 * Auth: gated by the admin cookie via middleware.ts (matcher: /admin/:path+).
 * Data flow: server-side only via lib/google/finance-sheet.ts (service
 * account, read-only scope). Sheet contents never reach the browser except
 * as the four rendered numbers below.
 *
 * Caching: revalidate=3600 means at most one Sheets API call per hour per
 * deployment. Hitting the page right after updating the sheet won't reflect
 * for up to an hour; that's the accepted tradeoff vs hammering Google.
 */
export const revalidate = 3600;

// USD with no cents — matches the rest of /admin/finance where headline
// numbers are integer dollars and only transaction tables show cents.
function money(n: number | null): string {
  if (n === null) return "—";
  const sign = n < 0 ? "−" : "";
  return `${sign}$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
}

function months(n: number | null): string {
  if (n === null) return "—";
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

export default async function FinanceModelPage() {
  const status = await loadFinanceModel();

  return (
    <div className="max-w-5xl px-4 lg:px-8 py-6 lg:py-8 space-y-6">
      <header>
        <div className="text-[10px] uppercase tracking-[0.25em] text-orange/80 mb-1">
          Live from the founder model
        </div>
        <h1 className="font-display font-black uppercase tracking-tight text-ink-1 text-4xl sm:text-5xl leading-none">
          Model
        </h1>
        <p className="mt-2 text-sm text-ink-2 max-w-2xl">
          The four numbers that decide whether we keep going. Pulled directly
          from the source-of-truth Google Sheet — refreshes hourly.
        </p>
      </header>

      {status.kind === "not_configured" && (
        <NotConfigured missing={status.missing} />
      )}
      {status.kind === "error" && <ErrorPanel message={status.message} />}
      {status.kind === "ok" && (
        <>
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card
              label="Cash balance"
              value={money(status.data.cashBalance)}
              accent="orange"
            />
            <Card
              label="Monthly burn"
              value={`${money(status.data.monthlyBurn)}/mo`}
            />
            <Card label="Runway" value={months(status.data.runwayMonths)} />
            <Card
              label="Funding needed to survive"
              value={money(status.data.fundingNeeded)}
              tone={
                (status.data.fundingNeeded ?? 0) > 0 ? "warn" : undefined
              }
            />
          </section>

          <footer className="flex items-center justify-between gap-3 text-xs text-ink-2 pt-2">
            <span>Last fetched {fmtTime(status.data.fetchedAt)}</span>
            <a
              href={status.data.sheetUrl}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-orange hover:text-orange-dark bg-orange/10 hover:bg-orange/15 border border-orange/30 px-3 py-2 rounded-lg whitespace-nowrap"
            >
              View full model ↗
            </a>
          </footer>
        </>
      )}
    </div>
  );
}

// ── UI bits ──────────────────────────────────────────────────────────────

function Card({
  label,
  value,
  accent,
  tone,
}: {
  label: string;
  value: string;
  accent?: "orange";
  tone?: "warn";
}) {
  const valueClass =
    tone === "warn"
      ? "text-[#A56A1B]"
      : accent === "orange"
      ? "text-orange"
      : "text-ink-1";
  return (
    <div className="rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel p-5">
      <div className="text-[10px] uppercase tracking-widest text-ink-2">
        {label}
      </div>
      <div
        className={`mt-1 font-display font-black text-3xl leading-none ${valueClass}`}
      >
        {value}
      </div>
    </div>
  );
}

function NotConfigured({ missing }: { missing: string[] }) {
  return (
    <div className="rounded-card border border-[#D9BE86] bg-[#F4E8D0] p-6 space-y-3">
      <div className="text-sm font-semibold text-amber-200">
        Not configured yet
      </div>
      <p className="text-sm text-ink-1 leading-relaxed">
        The Finance Model page is wired up but missing configuration. Once the
        items below are set, this page will render live KPIs from the source
        sheet on every visit (cached 1 hour).
      </p>
      <ul className="text-xs font-mono text-amber-100/90 space-y-1 pl-4 list-disc">
        {missing.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
      <p className="text-xs text-ink-2 leading-relaxed">
        Env vars belong in Vercel (Production + Preview + Development).
        The Apps Script Web App source lives at{" "}
        <code className="text-ink-1">scripts/finance-model-webhook.gs</code>{" "}
        — paste it into the sheet&apos;s Extensions → Apps Script editor.
      </p>
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="rounded-card border border-expense/30 bg-expense-bg p-6 space-y-2">
      <div className="text-sm font-semibold text-expense">
        Couldn&apos;t reach the sheet
      </div>
      <p className="text-sm text-ink-1 leading-relaxed">
        Google Sheets API returned an error. The most likely causes are:
        the service account hasn&apos;t been granted Viewer on the spreadsheet,
        the spreadsheet ID is wrong, or the private key newline escaping is
        off. Full error below.
      </p>
      <pre className="mt-2 text-[11px] text-expense font-mono bg-surface border border-hairline rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
        {message}
      </pre>
    </div>
  );
}
