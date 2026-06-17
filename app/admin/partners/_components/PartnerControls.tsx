"use client";

// Shared partner client pieces: the Partner type, kind labels, the shared
// input style, and the "+ Add partner" form. The interactive list lives in
// PartnersWorkspace; the org profile lives under [id]/.

import { useState } from "react";
import { useRouter } from "next/navigation";

export type Partner = {
  id: string;
  name: string;
  kind: string;
  status: string;
  city: string | null;
  region: string | null;
  domain: string | null;
  priority_score: number | null;
  champion_name: string | null;
  champion_email: string | null;
  teen_count: string | null;
  program_type: string | null;
  mou_status: string;
  mou_start: string | null;
  mou_end: string | null;
  data_agreement_signed: string | null;
  referral: string | null;
  notes: string | null;
  last_touch_at: string | null;
  external_source: string | null;
  // Derived (joined in the page query), not columns:
  contact_count?: number;
  primary_contact?: string | null;
};

export const KIND_LABELS: Record<string, string> = {
  school: "School",
  district: "District",
  nonprofit: "Nonprofit",
  company: "Company",
  other: "Other",
};

export const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";

export function NewPartnerForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("school");
  const [status, setStatus] = useState("prospect");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/admin/partners/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          kind,
          status,
          city: city || undefined,
          region: region || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(j.error ?? `HTTP ${res.status}`);
        setBusy(false);
        return;
      }
      if (j.id) {
        router.push(`/admin/partners/${j.id}`);
        return;
      }
      setName(""); setCity(""); setRegion("");
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors">
        + Add partner
      </button>
    );
  }

  return (
    <form onSubmit={submit}
      className="w-full bg-surface shadow-panel border-[1.5px] border-outline rounded-card p-4 grid grid-cols-2 lg:grid-cols-6 gap-3 items-end">
      <label className="text-xs text-ink-2 col-span-2 lg:col-span-2">
        Organization
        <input className={`${inputCls} w-full mt-1`} value={name} required autoFocus
          placeholder="Roosevelt Middle School" onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="text-xs text-ink-2">
        Type
        <select className={`${inputCls} w-full mt-1`} value={kind} onChange={(e) => setKind(e.target.value)}>
          {Object.entries(KIND_LABELS).map(([k, v]) => (
            <option key={k} value={k} className="bg-surface">{v}</option>
          ))}
        </select>
      </label>
      <label className="text-xs text-ink-2">
        City
        <input className={`${inputCls} w-full mt-1`} value={city}
          placeholder="Oakland" onChange={(e) => setCity(e.target.value)} />
      </label>
      <label className="text-xs text-ink-2">
        State / area
        <input className={`${inputCls} w-full mt-1`} value={region}
          placeholder="CA" onChange={(e) => setRegion(e.target.value)} />
      </label>
      <label className="text-xs text-ink-2">
        Stage
        <select className={`${inputCls} w-full mt-1`} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="prospect" className="bg-surface">Prospect</option>
          <option value="outreach" className="bg-surface">Emerging</option>
          <option value="pilot" className="bg-surface">Piloting</option>
          <option value="active" className="bg-surface">Active</option>
          <option value="anchor" className="bg-surface">Anchor</option>
        </select>
      </label>
      <div className="flex gap-2 col-span-full">
        <button type="submit" disabled={busy}
          className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50">
          {busy ? "Saving…" : "Add partner"}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="text-xs text-ink-2 hover:text-ink-1 px-2">
          Cancel
        </button>
      </div>
    </form>
  );
}
