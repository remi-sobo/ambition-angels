"use client";

// Client filter bar for the Gifts report. Applies by pushing the filters into
// the URL (the server page reads searchParams and recomputes); the Export CSV
// link carries the same filters to the gifts export route.

import { useState } from "react";
import { useRouter } from "next/navigation";

type Option = { id: string; name: string };

const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";

const METHODS = ["card", "cash", "check", "ach", "in_kind", "stock", "other"];

export default function GiftReportFilters({
  initial,
  campaigns,
  funds,
}: {
  initial: { from: string; to: string; campaign_id: string; fund_id: string; method: string };
  campaigns: Option[];
  funds: Option[];
}) {
  const router = useRouter();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [campaignId, setCampaignId] = useState(initial.campaign_id);
  const [fundId, setFundId] = useState(initial.fund_id);
  const [method, setMethod] = useState(initial.method);

  const query = () => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (campaignId) p.set("campaign_id", campaignId);
    if (fundId) p.set("fund_id", fundId);
    if (method) p.set("method", method);
    return p.toString();
  };

  return (
    <div className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card p-4 flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-ink-3 font-semibold">
        From
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
      </label>
      <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-ink-3 font-semibold">
        To
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
      </label>
      <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-ink-3 font-semibold">
        Campaign
        <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className={inputCls}>
          <option value="" className="bg-tile shadow-tile">Any</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id} className="bg-tile shadow-tile">{c.name}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-ink-3 font-semibold">
        Fund
        <select value={fundId} onChange={(e) => setFundId(e.target.value)} className={inputCls}>
          <option value="" className="bg-tile shadow-tile">Any</option>
          {funds.map((f) => (
            <option key={f.id} value={f.id} className="bg-tile shadow-tile">{f.name}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-ink-3 font-semibold">
        Method
        <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>
          <option value="" className="bg-tile shadow-tile">Any</option>
          {METHODS.map((m) => (
            <option key={m} value={m} className="bg-tile shadow-tile">{m}</option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-2">
        <button
          onClick={() => router.push(`/admin/fundraising/reports?${query()}`)}
          className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors"
        >
          Apply
        </button>
        <a
          href={`/api/admin/gifts/export?${query()}`}
          className="text-xs font-semibold text-ink-1 hover:text-ink-1 bg-tile hover:bg-[#EFE6D4] border-[1.5px] border-outline px-4 py-2 rounded-full transition-colors"
        >
          Export CSV
        </a>
        {(from || to || campaignId || fundId || method) && (
          <button
            onClick={() => router.push("/admin/fundraising/reports")}
            className="text-xs font-semibold text-ink-2 hover:text-ink-1 transition-colors"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
