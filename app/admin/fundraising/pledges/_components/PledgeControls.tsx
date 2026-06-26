"use client";

// Client controls for pledges (Epic F): create a pledge, change its status,
// and act on individual installments. All call the admin API then refresh.

import { useState } from "react";
import { useRouter } from "next/navigation";

type Option = { id: string; name: string };

const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";
const labelCls = "flex flex-col gap-1 text-[11px] uppercase tracking-wider text-ink-3 font-semibold";

const FREQS = [
  ["monthly", "Monthly"],
  ["quarterly", "Quarterly"],
  ["annually", "Annually"],
  ["weekly", "Weekly"],
] as const;

export function NewPledgeForm({ campaigns, funds }: { campaigns: Option[]; funds: Option[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [donor, setDonor] = useState("");
  const [total, setTotal] = useState("");
  const [count, setCount] = useState("12");
  const [frequency, setFrequency] = useState("monthly");
  const [start, setStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [campaignId, setCampaignId] = useState("");
  const [fundId, setFundId] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/pledges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          constituent_name: donor,
          total_amount: total ? Number(total) : undefined,
          installment_count: count ? Number(count) : undefined,
          frequency,
          start_date: start,
          campaign_id: campaignId || undefined,
          fund_id: fundId || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      if (j.warning) alert(j.warning);
      router.push(`/admin/fundraising/pledges/${j.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create pledge");
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors"
      >
        + New pledge
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-4 flex flex-wrap items-end gap-3 w-full">
      <label className={labelCls}>
        Donor *
        <input required value={donor} onChange={(e) => setDonor(e.target.value)} placeholder="Name" className={inputCls + " w-48"} />
      </label>
      <label className={labelCls}>
        Total ($) *
        <input required type="number" min="0.01" step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} className={inputCls + " w-28"} />
      </label>
      <label className={labelCls}>
        Installments *
        <input required type="number" min="1" step="1" value={count} onChange={(e) => setCount(e.target.value)} className={inputCls + " w-24"} />
      </label>
      <label className={labelCls}>
        Frequency
        <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className={inputCls}>
          {FREQS.map(([v, l]) => (
            <option key={v} value={v} className="bg-tile shadow-tile">{l}</option>
          ))}
        </select>
      </label>
      <label className={labelCls}>
        First due *
        <input required type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputCls + " w-40"} />
      </label>
      {campaigns.length > 0 && (
        <label className={labelCls}>
          Campaign
          <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className={inputCls + " w-40"}>
            <option value="" className="bg-tile shadow-tile">—</option>
            {campaigns.map((c) => (<option key={c.id} value={c.id} className="bg-tile shadow-tile">{c.name}</option>))}
          </select>
        </label>
      )}
      {funds.length > 0 && (
        <label className={labelCls}>
          Fund
          <select value={fundId} onChange={(e) => setFundId(e.target.value)} className={inputCls + " w-40"}>
            <option value="" className="bg-tile shadow-tile">—</option>
            {funds.map((f) => (<option key={f.id} value={f.id} className="bg-tile shadow-tile">{f.name}</option>))}
          </select>
        </label>
      )}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy} className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50">
          {busy ? "Creating…" : "Create pledge"}
        </button>
        <button type="button" onClick={() => { setOpen(false); setError(""); }} className="text-xs font-semibold text-ink-2 hover:text-ink-1 px-2 py-2 transition-colors">
          Cancel
        </button>
      </div>
      {error && <p className="text-expense text-xs w-full">{error}</p>}
    </form>
  );
}

export type WonOpportunity = {
  id: string;
  label: string;
  askAmount: number;
  constituentId: string;
};

// Turn a won ask (a "steward"-stage opportunity) into a dated pledge with a
// generated installment schedule, so committed money that lived only in the
// pipeline becomes a real schedule that feeds runway and can be marked paid.
// Reuses POST /api/admin/pledges — same create + installment-generation path as
// a manual pledge, just pre-filled from the opportunity.
export function ConvertOpportunityForm({ opportunities }: { opportunities: WonOpportunity[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [oppId, setOppId] = useState("");
  const [count, setCount] = useState("1");
  const [frequency, setFrequency] = useState("monthly");
  const [start, setStart] = useState(() => new Date().toISOString().slice(0, 10));

  const selected = opportunities.find((o) => o.id === oppId) ?? null;

  if (opportunities.length === 0) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-orange border-[1.5px] border-orange/40 hover:bg-orange/10 px-4 py-2 rounded-full transition-colors"
      >
        Convert won ask →
      </button>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) {
      setError("Pick an opportunity to convert.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/pledges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          constituent_id: selected.constituentId,
          total_amount: selected.askAmount,
          installment_count: count ? Number(count) : 1,
          frequency,
          start_date: start,
          notes: `Converted from won opportunity: ${selected.label}`,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      if (j.warning) alert(j.warning);
      router.push(`/admin/fundraising/pledges/${j.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to convert");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-4 flex flex-wrap items-end gap-3 w-full">
      <label className={labelCls}>
        Won opportunity *
        <select required value={oppId} onChange={(e) => setOppId(e.target.value)} className={inputCls + " w-64"}>
          <option value="" className="bg-tile shadow-tile">Pick a won ask…</option>
          {opportunities.map((o) => (
            <option key={o.id} value={o.id} className="bg-tile shadow-tile">
              {o.label} — ${o.askAmount.toLocaleString()}
            </option>
          ))}
        </select>
      </label>
      <label className={labelCls}>
        Installments *
        <input required type="number" min="1" step="1" value={count} onChange={(e) => setCount(e.target.value)} className={inputCls + " w-24"} />
      </label>
      <label className={labelCls}>
        Frequency
        <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className={inputCls}>
          {FREQS.map(([v, l]) => (
            <option key={v} value={v} className="bg-tile shadow-tile">{l}</option>
          ))}
        </select>
      </label>
      <label className={labelCls}>
        First due *
        <input required type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputCls + " w-40"} />
      </label>
      {selected && (
        <div className="text-[11px] text-ink-2 self-center">
          {count && Number(count) > 0
            ? `${count} × ${(selected.askAmount / Number(count)).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 })}`
            : ""}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy} className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50">
          {busy ? "Converting…" : "Convert to pledge"}
        </button>
        <button type="button" onClick={() => { setOpen(false); setError(""); }} className="text-xs font-semibold text-ink-2 hover:text-ink-1 px-2 py-2 transition-colors">
          Cancel
        </button>
      </div>
      {error && <p className="text-expense text-xs w-full">{error}</p>}
    </form>
  );
}

export function PledgeStatusSelect({ pledgeId, status }: { pledgeId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <select
      value={status}
      disabled={busy}
      onChange={async (e) => {
        setBusy(true);
        try {
          await fetch(`/api/admin/pledges/${pledgeId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: e.target.value }),
          });
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
      className="bg-tile border-[1.5px] border-outline rounded-lg px-2 py-1.5 text-ink-1 text-xs focus:outline-none focus:border-orange/40 disabled:opacity-50"
    >
      <option value="active" className="bg-tile shadow-tile">Active</option>
      <option value="completed" className="bg-tile shadow-tile">Completed</option>
      <option value="cancelled" className="bg-tile shadow-tile">Cancelled</option>
    </select>
  );
}

export function PaymentActions({ paymentId, status }: { paymentId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const act = async (action: "paid" | "skip" | "reset") => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/pledges/payments/${paymentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? `HTTP ${res.status}`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="flex items-center gap-3">
      {status === "scheduled" && (
        <>
          <button disabled={busy} onClick={() => act("paid")} className="text-[11px] font-semibold text-revenue hover:text-revenue transition-colors disabled:opacity-50">
            Mark paid
          </button>
          <button disabled={busy} onClick={() => act("skip")} className="text-[11px] font-semibold text-ink-3 hover:text-ink-1 transition-colors disabled:opacity-50">
            Skip
          </button>
        </>
      )}
      {status !== "scheduled" && (
        <button disabled={busy} onClick={() => act("reset")} className="text-[11px] font-semibold text-ink-3 hover:text-orange transition-colors disabled:opacity-50">
          Reset
        </button>
      )}
    </span>
  );
}
