"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { money } from "../../_components/charts";
import RunwayTiers from "../../_components/RunwayTiers";
import type { RunwayPledge } from "@/lib/finance/runway";
import { TYPE } from "@/lib/admin/typeScale";

type Horizon = 3 | 6 | 12;

// Freshness: green when touched within a week, amber when stale, grey when never.
function freshness(iso: string | null): { label: string; tone: "fresh" | "stale" | "none" } {
  if (!iso) return { label: "never", tone: "none" };
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  const label = days <= 0 ? "today" : days === 1 ? "yesterday" : `${days}d ago`;
  return { label, tone: days > 7 ? "stale" : "fresh" };
}

function Chip({ tone, children }: { tone: "fresh" | "stale" | "none" | "done"; children: React.ReactNode }) {
  const cls =
    tone === "fresh" || tone === "done"
      ? "bg-revenue-bg border-revenue/30 text-revenue"
      : tone === "stale"
      ? "bg-[#A56A1B]/15 border-[#A56A1B]/30 text-[#A56A1B]"
      : "bg-tile border-outline text-ink-2";
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>{children}</span>
  );
}

export default function CloseWizard(props: {
  lastImportAt: string | null;
  lastSyncAt: string | null;
  lastBalanceAt: string | null;
  lastClosedAt: string | null;
  uncategorizedCount: number;
  cashOnHand: number;
  anchorDate: string | null;
  baseline: number | null;
  burn3mo: number;
  runwayInputs: {
    baseline: number;
    baselineSource: "config" | "trailing";
    bankBalance: number;
    mtdSpend: number;
  };
  endCurrentMonth: string;
  horizonEnds: Record<Horizon, string>;
  defaultHorizon: number;
  runwayPledges: RunwayPledge[];
}) {
  const router = useRouter();
  const imp = freshness(props.lastImportAt);
  const sync = freshness(props.lastSyncAt);
  const bal = freshness(props.lastBalanceAt);

  return (
    <ol className="space-y-4">
      <Step
        n={1}
        title="Import the bank CSV"
        status={<Chip tone={imp.tone}>last import {imp.label}</Chip>}
      >
        <p className="text-xs text-ink-2 mb-3">
          Upload this week&apos;s Wells Fargo export. New transactions are de-duplicated and
          AI-categorized on import.
        </p>
        <Link href="/admin/finance/upload" className="inline-block px-3 py-1.5 rounded-lg bg-orange hover:bg-orange-dark text-white text-sm font-medium">
          Open importer →
        </Link>
      </Step>

      <Step
        n={2}
        title="Clear uncategorized"
        status={
          props.uncategorizedCount === 0
            ? <Chip tone="done">all categorized</Chip>
            : <Chip tone="stale">{props.uncategorizedCount} to review</Chip>
        }
      >
        <p className="text-xs text-ink-2 mb-3">
          Uncategorized expenses still count toward burn, but the functional split and budget
          rollups need a category. Get this to zero (or knowingly leave it).
        </p>
        <Link
          href="/admin/finance/transactions?category=uncategorized"
          className="inline-block px-3 py-1.5 rounded-lg border-[1.5px] border-outline text-ink-1 hover:bg-tile text-sm font-medium"
        >
          {props.uncategorizedCount === 0 ? "Review transactions →" : `Categorize ${props.uncategorizedCount} →`}
        </Link>
      </Step>

      <Step
        n={3}
        title="Sync & confirm pledges"
        status={<Chip tone={sync.tone}>HubSpot synced {sync.label}</Chip>}
      >
        <p className="text-xs text-ink-2 mb-3">
          Refresh HubSpot, then fix any stale dates or amounts. Adopt a deal to edit it — pledges
          count at full value and feed the due/projected tiers; restricted and undated ones don&apos;t.
        </p>
        <Link
          href="/admin/finance/revenue"
          className="inline-block px-3 py-1.5 rounded-lg border-[1.5px] border-outline text-ink-1 hover:bg-tile text-sm font-medium"
        >
          Open pledges →
        </Link>
      </Step>

      <Step
        n={4}
        title="Set the bank balance"
        status={<Chip tone={bal.tone}>balance set {bal.label}</Chip>}
      >
        <BalanceForm cashOnHand={props.cashOnHand} anchorDate={props.anchorDate} onSaved={() => router.refresh()} />
      </Step>

      <Step
        n={5}
        title="Confirm the burn baseline"
        status={
          props.baseline != null
            ? <Chip tone="done">{money(props.baseline)}/mo set</Chip>
            : <Chip tone="stale">using trailing {money(props.burn3mo)}/mo</Chip>
        }
      >
        <BaselineForm baseline={props.baseline} burn3mo={props.burn3mo} onSaved={() => router.refresh()} />
      </Step>

      <Step n={6} title="Review & stamp the close" status={null} last>
        <p className="text-xs text-ink-2 mb-4">
          The three runway tiers as they stand now. If they look right, stamp the close so every
          surface shows the figures as reconciled today.
        </p>
        <RunwayTiers
          baseline={props.runwayInputs.baseline}
          baselineSource={props.runwayInputs.baselineSource}
          bankBalance={props.runwayInputs.bankBalance}
          mtdSpend={props.runwayInputs.mtdSpend}
          endCurrentMonth={props.endCurrentMonth}
          horizonEnds={props.horizonEnds}
          defaultHorizon={props.defaultHorizon}
          pledges={props.runwayPledges}
        />
        <StampButton lastClosedAt={props.lastClosedAt} onStamped={() => router.refresh()} />
      </Step>
    </ol>
  );
}

function Step({
  n,
  title,
  status,
  children,
  last,
}: {
  n: number;
  title: string;
  status: React.ReactNode;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <li className="rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel p-5">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span
            className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
              last ? "bg-orange text-white" : "bg-tile text-ink-1 border border-outline"
            }`}
          >
            {n}
          </span>
          <h2 className={TYPE.cardTitle}>{title}</h2>
        </div>
        {status}
      </div>
      <div className="pl-9">{children}</div>
    </li>
  );
}

function BalanceForm({
  cashOnHand,
  anchorDate,
  onSaved,
}: {
  cashOnHand: number;
  anchorDate: string | null;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [balance, setBalance] = useState("");
  const [asOf, setAsOf] = useState(today);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const entered = balance.trim() === "" ? null : Number(balance.replace(/,/g, ""));
  const valid = entered !== null && Number.isFinite(entered);
  const drift = valid && asOf === today ? entered! - cashOnHand : null;

  async function save() {
    if (!valid) return;
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
      setBalance("");
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-xs text-ink-2 mb-3">
        App computes <span className="text-ink-1 font-medium">{money(cashOnHand)}</span>
        {anchorDate ? <> anchored to {anchorDate}</> : null}. Enter the real bank balance to re-anchor.
      </p>
      <div className="flex items-end gap-3 flex-wrap">
        <label className="block">
          <span className="block text-[10px] uppercase tracking-wider text-ink-2 mb-1">Actual balance ($)</span>
          <input
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            inputMode="decimal"
            placeholder={String(Math.round(cashOnHand))}
            className="bg-ink border-[1.5px] border-outline rounded px-2 py-1.5 text-sm text-ink-1 w-40"
          />
        </label>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-wider text-ink-2 mb-1">As of</span>
          <input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="bg-ink border-[1.5px] border-outline rounded px-2 py-1.5 text-sm text-ink-1"
          />
        </label>
        <button
          type="button"
          disabled={!valid || busy}
          onClick={save}
          className="px-4 py-2 rounded-lg bg-orange hover:bg-orange-dark text-white text-sm font-medium disabled:opacity-40"
        >
          {busy ? "Saving…" : "Set balance"}
        </button>
      </div>
      {drift !== null && Math.abs(drift) >= 0.5 && (
        <p className="text-xs text-[#A56A1B] mt-2">
          {money(Math.abs(drift))} {drift > 0 ? "more than" : "less than"} the computed figure — likely
          unimported transactions. Setting the balance fixes the displayed cash regardless.
        </p>
      )}
      {err && <p className="text-xs text-expense mt-2">{err}</p>}
    </div>
  );
}

function BaselineForm({
  baseline,
  burn3mo,
  onSaved,
}: {
  baseline: number | null;
  burn3mo: number;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(baseline === null ? "" : String(baseline));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const v = value.trim() === "" ? null : Number(value.replace(/,/g, ""));
      const r = await fetch("/api/admin/finance/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthly_burn_baseline: v }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j.error ?? "Failed to save");
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-xs text-ink-2 mb-3">
        The monthly burn the runway divides by. Blank = fall back to the trailing 3-month average
        (currently <span className="text-ink-1 font-medium">{money(burn3mo)}/mo</span>).
      </p>
      <div className="flex items-end gap-3 flex-wrap">
        <label className="block">
          <span className="block text-[10px] uppercase tracking-wider text-ink-2 mb-1">Baseline ($/mo)</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="decimal"
            placeholder="50000"
            className="bg-ink border-[1.5px] border-outline rounded px-2 py-1.5 text-sm text-ink-1 w-40"
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="px-4 py-2 rounded-lg bg-orange hover:bg-orange-dark text-white text-sm font-medium disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save baseline"}
        </button>
      </div>
      {err && <p className="text-xs text-expense mt-2">{err}</p>}
    </div>
  );
}

function StampButton({ lastClosedAt, onStamped }: { lastClosedAt: string | null; onStamped: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function stamp() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/finance/close", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j.error ?? "Failed to stamp");
        return;
      }
      onStamped();
    } finally {
      setBusy(false);
    }
  }

  const stamped = lastClosedAt
    ? new Date(lastClosedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
    : null;

  return (
    <div className="mt-4 flex items-center gap-3 flex-wrap">
      <button
        type="button"
        disabled={busy}
        onClick={stamp}
        className="px-4 py-2 rounded-lg bg-orange hover:bg-orange-dark text-white text-sm font-medium disabled:opacity-40"
      >
        {busy ? "Stamping…" : "Mark reconciled as of today"}
      </button>
      {stamped && <span className="text-xs text-revenue">Reconciled as of {stamped}</span>}
      {err && <span className="text-xs text-expense">{err}</span>}
    </div>
  );
}
