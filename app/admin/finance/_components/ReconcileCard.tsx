"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import InfoTip from "./InfoTip";

// "Set current balance" / reconcile. Lets the user anchor cash to a real,
// bank-verified number in one field: type today's actual balance, see how far
// the app's computed cash has drifted (a signal that uploads are missing or
// duplicated), then confirm to re-anchor. Shown on the dashboard and the upload
// hub. Reads computed cash + anchor/freshness as props from the canonical
// finance snapshot.

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function ago(iso: string | null): { label: string; stale: boolean } {
  if (!iso) return { label: "never reconciled", stale: true };
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return { label: "reconciled today", stale: false };
  if (days === 1) return { label: "reconciled yesterday", stale: false };
  return { label: `reconciled ${days}d ago`, stale: days > 14 };
}

export default function ReconcileCard({
  computedCash,
  anchorDate,
  reconciledAt,
}: {
  computedCash: number;
  anchorDate: string | null;
  reconciledAt: string | null;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState("");
  const [asOf, setAsOf] = useState(today);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const entered = balance.trim() === "" ? null : Number(balance.replace(/,/g, ""));
  const enteredValid = entered !== null && Number.isFinite(entered);
  // Drift is only meaningful when reconciling to *today* (computed cash is "now").
  const drift = enteredValid && asOf === today ? entered! - computedCash : null;

  const freshness = ago(reconciledAt);

  async function submit() {
    if (!enteredValid) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/finance/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ balance: entered, as_of: asOf }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j.error ?? "Failed to save");
        return;
      }
      setOpen(false);
      setBalance("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-ink-2">
            Cash on hand
            <InfoTip heading="Cash on hand">
              The trusted current bank balance: the <b>last balance you set</b> (the
              anchor) <b>plus every transaction dated after it</b>. Formula:{" "}
              <code>starting balance + Σ(transactions after the anchor date)</code>.
              Use &ldquo;Set current balance&rdquo; to re-anchor it to the real bank
              number whenever you upload.
            </InfoTip>
          </div>
          <div className="mt-1 font-display font-black text-3xl text-orange leading-none">{fmtMoney(computedCash)}</div>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className="text-ink-2">anchored to {anchorDate ?? "— (set a balance)"}</span>
            <span
              className={`px-1.5 py-0.5 rounded-full border text-[11px] font-semibold ${
                freshness.stale
                  ? "bg-expense-bg border-expense/30 text-expense"
                  : "bg-revenue-bg border-revenue/30 text-revenue"
              }`}
            >
              {freshness.label}
            </span>
          </div>
        </div>

        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="px-4 py-2 rounded-lg bg-orange hover:bg-orange-dark text-white text-sm font-medium"
          >
            Set current balance
          </button>
        )}
      </div>

      {open && (
        <div className="mt-5 pt-5 border-t border-hairline space-y-4">
          <p className="text-xs text-ink-2 max-w-2xl">
            Enter the actual balance from your bank. We&apos;ll anchor cash to it and date it — cash on hand becomes this
            number plus any transactions you upload dated after it. Do this whenever you want the number to match the
            bank exactly (e.g. after each weekly upload).
          </p>
          <div className="grid sm:grid-cols-2 gap-4 max-w-xl">
            <label className="block">
              <span className="block text-[10px] uppercase tracking-wider text-ink-2 mb-1">Actual bank balance ($)</span>
              <input
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                inputMode="decimal"
                placeholder="121589"
                autoFocus
                className="w-full bg-ink border-[1.5px] border-outline rounded px-2 py-1.5 text-sm text-ink-1"
              />
            </label>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-wider text-ink-2 mb-1">As of date</span>
              <input
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
                className="w-full bg-ink border-[1.5px] border-outline rounded px-2 py-1.5 text-sm text-ink-1"
              />
            </label>
          </div>

          {drift !== null && Math.abs(drift) >= 0.5 && (
            <p className="text-xs">
              <span className={Math.abs(drift) > 0 ? "text-[#A56A1B]" : "text-revenue"}>
                The app currently computes {fmtMoney(computedCash)} — that&apos;s{" "}
                {fmtMoney(Math.abs(drift))} {drift > 0 ? "less than" : "more than"} your number.
              </span>{" "}
              <span className="text-ink-2">
                A gap usually means some transactions haven&apos;t been uploaded yet. Setting the balance fixes the
                displayed cash regardless.
              </span>
            </p>
          )}
          {drift !== null && Math.abs(drift) < 0.5 && (
            <p className="text-xs text-revenue">Matches the app&apos;s computed cash — you&apos;re reconciled. ✓</p>
          )}

          {err && <p className="text-xs text-expense">{err}</p>}

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={!enteredValid || busy}
              onClick={submit}
              className="px-4 py-2 rounded-lg bg-orange hover:bg-orange-dark text-white text-sm font-medium disabled:opacity-40"
            >
              {busy ? "Saving…" : "Set balance"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setErr(null);
              }}
              className="px-4 py-2 rounded-lg text-ink-2 hover:text-ink-1 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
