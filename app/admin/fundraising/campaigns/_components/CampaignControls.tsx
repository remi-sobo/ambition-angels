"use client";

// Client controls for Campaigns: create campaign, create appeal, bulk
// attribution. Same convention as the rest of Fundraising: call the admin
// APIs, then router.refresh().

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";

export function NewCampaignForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          goal: goal ? Number(goal) : undefined,
          starts_on: startsOn || undefined,
          ends_on: endsOn || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setName(""); setGoal(""); setStartsOn(""); setEndsOn("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create campaign");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors"
      >
        + New campaign
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="w-full bg-surface shadow-panel border-[1.5px] border-outline rounded-card p-4 grid grid-cols-2 lg:grid-cols-5 gap-3 items-end"
    >
      <label className="col-span-2 text-xs text-ink-2">
        Name
        <input className={`${inputCls} w-full mt-1`} value={name}
          onChange={(e) => setName(e.target.value)} placeholder="FY26 Annual Fund" required autoFocus />
      </label>
      <label className="text-xs text-ink-2">
        Goal $
        <input className={`${inputCls} w-full mt-1`} type="number" min="0" step="1000"
          value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="250000" />
      </label>
      <label className="text-xs text-ink-2">
        Starts
        <input className={`${inputCls} w-full mt-1`} type="date" value={startsOn}
          onChange={(e) => setStartsOn(e.target.value)} />
      </label>
      <label className="text-xs text-ink-2">
        Ends
        <input className={`${inputCls} w-full mt-1`} type="date" value={endsOn}
          onChange={(e) => setEndsOn(e.target.value)} />
      </label>
      <div className="col-span-full flex gap-2">
        <button type="submit" disabled={busy}
          className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50">
          {busy ? "Saving…" : "Create"}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="text-xs text-ink-2 hover:text-ink-1 px-2">
          Cancel
        </button>
        {error && <p className="text-expense text-xs self-center">{error}</p>}
      </div>
    </form>
  );
}

export function NewAppealForm({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, campaign_id: campaignId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? `HTTP ${res.status}`);
      }
      setName("");
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="text-[11px] text-ink-2 hover:text-ink-1 border border-dashed border-outline rounded-full px-3 py-1 transition-colors">
        + appeal
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <input className={`${inputCls} !py-1 !text-xs w-44`} value={name} autoFocus
        placeholder="Spring email #2" onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void submit(); } }} />
      <button onClick={() => void submit()} disabled={busy}
        className="text-[11px] font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1 rounded-full disabled:opacity-50">
        Add
      </button>
      <button onClick={() => setOpen(false)} className="text-[11px] text-ink-2 hover:text-ink-1">
        ×
      </button>
    </span>
  );
}

export function BulkAttributeForm({
  campaigns,
  unattributed,
}: {
  campaigns: Array<{ id: string; name: string }>;
  unattributed: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [from, setFrom] = useState("2000-01-01");
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  const submit = async () => {
    if (!campaignId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/campaigns/attribute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_id: campaignId, from, to }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) alert(j.error ?? `HTTP ${res.status}`);
      else alert(`Attributed ${j.count} gift${j.count === 1 ? "" : "s"}.`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-orange/5 border border-orange/20 rounded-card p-4">
      <p className="text-sm text-ink-1 mb-3">
        <span className="font-semibold text-orange">{unattributed}</span> gift
        {unattributed === 1 ? "" : "s"} aren&apos;t attributed to a campaign yet. Assign the
        unattributed gifts in a date range (already-attributed gifts are never touched):
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-ink-2">
          From
          <input className={`${inputCls} block mt-1`} type="date" value={from}
            onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="text-xs text-ink-2">
          To
          <input className={`${inputCls} block mt-1`} type="date" value={to}
            onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="text-xs text-ink-2">
          Campaign
          <select className={`${inputCls} block mt-1`} value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <button onClick={() => void submit()} disabled={busy || !campaignId}
          className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50">
          {busy ? "Assigning…" : "Attribute gifts"}
        </button>
      </div>
    </div>
  );
}
