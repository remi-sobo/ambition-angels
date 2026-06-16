"use client";

// Client controls for manual gift entry on a donor profile (Epic A). Call the
// admin gifts API then router.refresh() so the server profile re-renders with
// the new gift in the timeline, stats, and acknowledgment count.

import { useState } from "react";
import { useRouter } from "next/navigation";

type Option = { id: string; name: string };

const METHODS = [
  ["check", "Check"],
  ["cash", "Cash"],
  ["card", "Card"],
  ["ach", "ACH"],
  ["stock", "Stock"],
  ["in_kind", "In-kind"],
  ["other", "Other"],
] as const;

const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";
const labelCls =
  "flex flex-col gap-1 text-[11px] uppercase tracking-wider text-ink-3 font-semibold";

export function GiftEntryForm({
  constituentId,
  campaigns,
  funds,
  appeals,
}: {
  constituentId: string;
  campaigns: Option[];
  funds: Option[];
  appeals: Option[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("check");
  const [campaignId, setCampaignId] = useState("");
  const [fundId, setFundId] = useState("");
  const [appealId, setAppealId] = useState("");
  const [fmv, setFmv] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setAmount(""); setMethod("check"); setCampaignId(""); setFundId("");
    setAppealId(""); setFmv(""); setNotes("");
    setDate(new Date().toISOString().slice(0, 10));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/gifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          constituent_id: constituentId,
          amount: amount ? Number(amount) : undefined,
          gift_date: date,
          method,
          campaign_id: campaignId || undefined,
          fund_id: fundId || undefined,
          appeal_id: appealId || undefined,
          fair_market_value: fmv ? Number(fmv) : undefined,
          notes: notes || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      reset();
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record gift");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1.5 rounded-full transition-colors"
      >
        + Add gift
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="px-5 py-4 border-b border-outline flex flex-wrap items-end gap-3 bg-tile">
      <label className={labelCls}>
        Amount ($) *
        <input
          required type="number" min="0.01" step="0.01" value={amount}
          onChange={(e) => setAmount(e.target.value)} className={inputCls + " w-28"}
        />
      </label>
      <label className={labelCls}>
        Date *
        <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls + " w-40"} />
      </label>
      <label className={labelCls}>
        Method
        <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>
          {METHODS.map(([v, l]) => (
            <option key={v} value={v} className="bg-tile shadow-tile">{l}</option>
          ))}
        </select>
      </label>
      {campaigns.length > 0 && (
        <label className={labelCls}>
          Campaign
          <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className={inputCls + " w-40"}>
            <option value="" className="bg-tile shadow-tile">—</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id} className="bg-tile shadow-tile">{c.name}</option>
            ))}
          </select>
        </label>
      )}
      {funds.length > 0 && (
        <label className={labelCls}>
          Fund
          <select value={fundId} onChange={(e) => setFundId(e.target.value)} className={inputCls + " w-40"}>
            <option value="" className="bg-tile shadow-tile">—</option>
            {funds.map((f) => (
              <option key={f.id} value={f.id} className="bg-tile shadow-tile">{f.name}</option>
            ))}
          </select>
        </label>
      )}
      {appeals.length > 0 && (
        <label className={labelCls}>
          Appeal
          <select value={appealId} onChange={(e) => setAppealId(e.target.value)} className={inputCls + " w-40"}>
            <option value="" className="bg-tile shadow-tile">—</option>
            {appeals.map((a) => (
              <option key={a.id} value={a.id} className="bg-tile shadow-tile">{a.name}</option>
            ))}
          </select>
        </label>
      )}
      {(method === "in_kind" || method === "stock" || fmv) && (
        <label className={labelCls} title="For quid-pro-quo / non-cash gifts; deductible = amount − FMV">
          FMV ($)
          <input type="number" min="0" step="0.01" value={fmv} onChange={(e) => setFmv(e.target.value)} className={inputCls + " w-28"} />
        </label>
      )}
      <label className={labelCls + " flex-1 min-w-[12rem]"}>
        Notes
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" className={inputCls + " w-full"} />
      </label>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy} className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50">
          {busy ? "Saving…" : "Record gift"}
        </button>
        <button type="button" onClick={() => { setOpen(false); setError(""); }} className="text-xs font-semibold text-ink-2 hover:text-ink-1 px-2 py-2 transition-colors">
          Cancel
        </button>
      </div>
      {error && <p className="text-expense text-xs w-full">{error}</p>}
    </form>
  );
}

export function GiftRowActions({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        if (!confirm("Delete this gift? This removes it from all totals.")) return;
        setBusy(true);
        try {
          const res = await fetch(`/api/admin/gifts/${id}`, { method: "DELETE" });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            alert(j.error ?? `Delete failed (HTTP ${res.status})`);
            return;
          }
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
      className="text-[11px] font-semibold text-ink-3 hover:text-expense transition-colors disabled:opacity-50"
    >
      Delete
    </button>
  );
}
