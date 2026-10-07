import type { QuickBooksStatus } from "@/lib/quickbooks/connection";
import { registerTotals } from "@/lib/quickbooks/register";
import QuickBooksRefreshButton from "./QuickBooksRefreshButton";
import { TYPE } from "@/lib/admin/typeScale";

// The QuickBooks to-date register on Finance → Transactions: every income and
// expense line from QBO with the account it's assigned to. Read from the
// cached pull on the org's connection (lib/quickbooks/connection.ts); the
// daily cron and "Refresh now" keep it current. Not connected → a connect
// prompt instead.

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const CONNECT_HREF = "/api/admin/finance/quickbooks/start";

export default function QuickBooksRegister({
  status,
  notice,
}: {
  status: QuickBooksStatus;
  /** ?qbo= / ?reason= from the connect round trip. */
  notice?: { qbo?: string; reason?: string };
}) {
  const banner =
    notice?.qbo === "connected" ? (
      <p className="text-xs text-revenue">QuickBooks connected. The register and cash balance are pulled below.</p>
    ) : notice?.qbo === "cancelled" ? (
      <p className="text-xs text-ink-2">QuickBooks connection cancelled.</p>
    ) : notice?.qbo === "error" ? (
      <p className="text-xs text-expense">{notice.reason ?? "QuickBooks connection failed."}</p>
    ) : null;

  if (!status.connected) {
    return (
      <section className="rounded-panel-lg border-hairline bg-surface p-5 mb-4 space-y-3">
        <div className={TYPE.cardLabel}>QuickBooks register</div>
        {banner}
        <p className="text-sm text-ink-1 max-w-2xl">
          {status.needsReconnect
            ? "QuickBooks needs to be reconnected: Intuit stopped accepting BloomOS's access (it was revoked or sat unused too long)."
            : "Connect QuickBooks Online to pull the to-date transaction register (each line with its account) and the current cash-in-account balance, which becomes the base number for runway."}
        </p>
        <p className="text-xs text-ink-2 max-w-2xl">
          Read-only: BloomOS reads those two things once a day and never writes to your books. No budgets, classes,
          or reconciliation data are pulled.
        </p>
        {status.configured ? (
          <a
            href={CONNECT_HREF}
            className="inline-block rounded-full bg-orange hover:bg-orange-dark text-white text-sm px-4 py-1.5"
          >
            {status.needsReconnect ? "Reconnect QuickBooks" : "Connect QuickBooks"}
          </a>
        ) : (
          <p className="text-xs text-status-watch-text">
            The QuickBooks app keys aren&apos;t set on the server yet (QBO_CLIENT_ID / QBO_CLIENT_SECRET).
          </p>
        )}
      </section>
    );
  }

  const reg = status.register;
  const lines = reg?.lines ?? [];
  const totals = registerTotals(lines);

  return (
    <section className="rounded-panel-lg border-hairline bg-surface mb-4 overflow-hidden">
      <div className="p-5 pb-3 space-y-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className={TYPE.cardLabel}>QuickBooks register</div>
            <div className="text-xs text-ink-2 mt-1">
              {reg ? `${reg.start} to ${reg.end}, cash basis` : "Not pulled yet"}
              {status.lastSyncAt ? ` · synced ${fmtWhen(status.lastSyncAt)}` : ""}
            </div>
          </div>
          <QuickBooksRefreshButton />
        </div>
        {banner}
        {status.lastError && <p className="text-xs text-expense">Last refresh failed: {status.lastError}</p>}
        {reg && (
          <div className="flex gap-6 text-xs">
            <span>
              Income <b className="text-revenue">{fmtMoney(totals.income)}</b>
            </span>
            <span>
              Expenses <b className="text-expense">{fmtMoney(totals.expense)}</b>
            </span>
            <span>
              Net <b className="text-ink-1">{fmtMoney(totals.income - totals.expense)}</b>
            </span>
            <span className="text-ink-2">{lines.length} lines</span>
          </div>
        )}
        {reg?.truncated && (
          <p className="text-xs text-status-watch-text">Showing the newest {lines.length} lines.</p>
        )}
      </div>

      <div className="overflow-x-auto max-h-[32rem] overflow-y-auto border-t border-hairline">
        <table className="w-full text-xs">
          <thead className={`bg-surface sticky top-0 ${TYPE.tableHeader}`}>
            <tr>
              <th className="text-left px-3 py-2.5 w-[6.5rem]">Date</th>
              <th className="text-left px-3 py-2.5">Description</th>
              <th className="text-left px-3 py-2.5 w-64">Account</th>
              <th className="text-right px-3 py-2.5 w-32">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-ink-2">
                  No income or expense lines in QuickBooks for this period yet.
                </td>
              </tr>
            )}
            {lines.map((l, i) => {
              const desc = [l.name, l.memo].filter(Boolean).join(" · ") || l.type || "—";
              return (
                <tr key={i} className="border-t border-hairline">
                  <td className="px-3 py-2 tabular-nums text-ink-2">{l.date}</td>
                  <td className="px-3 py-2 text-ink-1">
                    <div className="truncate max-w-[28rem]" title={desc}>
                      {desc}
                    </div>
                    {l.type && <div className="text-ink-2">{l.type}</div>}
                  </td>
                  <td className="px-3 py-2 text-ink-1">{l.account}</td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${l.amount >= 0 ? "text-revenue" : "text-expense"}`}
                  >
                    {fmtMoney(l.amount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
