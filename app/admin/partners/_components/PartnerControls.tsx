"use client";

// Client pieces of Schools & Partners: rows with status advance, MOU
// tracking, log-touch, inline edit; and the new-partner form.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { STATUS_ORDER, STATUS_LABELS } from "../_lib/status";

export type Partner = {
  id: string;
  name: string;
  kind: string;
  status: string;
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
};


const KIND_LABELS: Record<string, string> = {
  school: "School",
  district: "District",
  nonprofit: "Nonprofit",
  company: "Company",
  other: "Other",
};

const inputCls =
  "bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-cream text-sm placeholder-gray-mid focus:outline-none focus:border-orange/40";

export function PartnerRow({ partner }: { partner: Partner }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const patch = async (fields: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/partners/manage/${partner.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete ${partner.name}?`)) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/partners/manage/${partner.id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const mouExpired =
    partner.mou_status === "signed" && !!partner.mou_end && partner.mou_end < today;
  const stale =
    (partner.status === "active" || partner.status === "anchor") &&
    (!partner.last_touch_at ||
      partner.last_touch_at < new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10));

  return (
    <article
      className={`bg-[#1d1812] border rounded-xl p-3 text-sm ${
        mouExpired ? "border-red-500/40" : "border-white/10"
      } ${busy ? "opacity-60" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-cream">{partner.name}</span>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/10 text-gray-mid uppercase tracking-wider">
          {KIND_LABELS[partner.kind] ?? partner.kind}
        </span>
        {partner.mou_status !== "none" && (
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              partner.mou_status === "signed"
                ? mouExpired
                  ? "bg-red-500/15 text-red-300"
                  : "bg-green-500/15 text-green-400"
                : "bg-amber-500/15 text-amber-400"
            }`}
          >
            MOU {partner.mou_status}
            {partner.mou_end ? ` · ${mouExpired ? "expired" : "ends"} ${partner.mou_end}` : ""}
          </span>
        )}
        {partner.teen_count && (
          <span className="text-[11px] text-gray-mid">{partner.teen_count} teens</span>
        )}
        <span className={`ml-auto text-[11px] tabular-nums ${stale ? "text-amber-400" : "text-gray-mid"}`}>
          {partner.last_touch_at ? `touched ${partner.last_touch_at}` : "never touched"}
        </span>
      </div>

      {(partner.champion_name || partner.champion_email) && (
        <p className="text-[12px] text-gray-mid mt-1">
          Champion: {partner.champion_name ?? "—"}
          {partner.champion_email && (
            <a href={`mailto:${partner.champion_email}`} className="text-orange/80 hover:text-orange ml-1.5">
              {partner.champion_email}
            </a>
          )}
          {partner.program_type ? ` · ${partner.program_type}` : ""}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1 mt-2">
        <select
          value={partner.status}
          disabled={busy}
          onChange={(e) => patch({ status: e.target.value })}
          className="text-[11px] bg-white/5 border border-white/10 rounded-md px-2 py-1 text-cream/80 cursor-pointer"
        >
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s} className="bg-[#1d1812]">{STATUS_LABELS[s]}</option>
          ))}
        </select>
        <button
          onClick={() => patch({ touch: true })}
          disabled={busy}
          className="px-2 py-1 rounded-md text-[11px] font-semibold bg-orange/15 text-orange hover:bg-orange/25"
        >
          Log touch
        </button>
        <button
          onClick={() => setEditing((v) => !v)}
          className="px-2 py-1 rounded-md text-[11px] bg-white/5 hover:bg-white/10 text-cream/70"
        >
          Edit
        </button>
        <button
          onClick={() => void remove()}
          disabled={busy}
          className="ml-auto px-2 py-1 rounded-md text-[11px] text-gray-mid hover:text-red-300"
        >
          Delete
        </button>
      </div>

      {editing && <InlineEdit partner={partner} patch={patch} onDone={() => setEditing(false)} />}
    </article>
  );
}

function InlineEdit({
  partner,
  patch,
  onDone,
}: {
  partner: Partner;
  patch: (fields: Record<string, unknown>) => Promise<void>;
  onDone: () => void;
}) {
  const [kind, setKind] = useState(partner.kind);
  const [championName, setChampionName] = useState(partner.champion_name ?? "");
  const [championEmail, setChampionEmail] = useState(partner.champion_email ?? "");
  const [mouStatus, setMouStatus] = useState(partner.mou_status);
  const [mouEnd, setMouEnd] = useState(partner.mou_end ?? "");
  const [dsa, setDsa] = useState(partner.data_agreement_signed ?? "");

  const save = async () => {
    await patch({
      kind,
      champion_name: championName || null,
      champion_email: championEmail || null,
      mou_status: mouStatus,
      mou_end: mouEnd || null,
      data_agreement_signed: dsa || null,
    });
    onDone();
  };

  return (
    <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-2 lg:grid-cols-6 gap-2 items-end">
      <label className="text-[10px] text-gray-mid">
        Type
        <select className={`${inputCls} block w-full mt-0.5 !py-1 !text-xs`} value={kind}
          onChange={(e) => setKind(e.target.value)}>
          {Object.entries(KIND_LABELS).map(([k, v]) => (
            <option key={k} value={k} className="bg-[#1d1812]">{v}</option>
          ))}
        </select>
      </label>
      <label className="text-[10px] text-gray-mid">
        Champion
        <input className={`${inputCls} block w-full mt-0.5 !py-1 !text-xs`} value={championName}
          onChange={(e) => setChampionName(e.target.value)} />
      </label>
      <label className="text-[10px] text-gray-mid">
        Champion email
        <input className={`${inputCls} block w-full mt-0.5 !py-1 !text-xs`} value={championEmail}
          onChange={(e) => setChampionEmail(e.target.value)} />
      </label>
      <label className="text-[10px] text-gray-mid">
        MOU
        <select className={`${inputCls} block w-full mt-0.5 !py-1 !text-xs`} value={mouStatus}
          onChange={(e) => setMouStatus(e.target.value)}>
          {["none", "drafting", "sent", "signed"].map((s) => (
            <option key={s} value={s} className="bg-[#1d1812]">{s}</option>
          ))}
        </select>
      </label>
      <label className="text-[10px] text-gray-mid">
        MOU ends
        <input className={`${inputCls} block w-full mt-0.5 !py-1 !text-xs`} type="date" value={mouEnd}
          onChange={(e) => setMouEnd(e.target.value)} />
      </label>
      <label className="text-[10px] text-gray-mid">
        Data agreement
        <input className={`${inputCls} block w-full mt-0.5 !py-1 !text-xs`} type="date" value={dsa}
          onChange={(e) => setDsa(e.target.value)} />
      </label>
      <div className="col-span-full flex justify-end gap-2">
        <button onClick={onDone} className="text-[11px] text-gray-mid hover:text-cream px-2 py-1">
          Cancel
        </button>
        <button onClick={() => void save()}
          className="text-[11px] font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1 rounded-full">
          Save
        </button>
      </div>
    </div>
  );
}

export function NewPartnerForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("school");
  const [championName, setChampionName] = useState("");
  const [championEmail, setChampionEmail] = useState("");

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
          champion_name: championName || undefined,
          champion_email: championEmail || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? `HTTP ${res.status}`);
      }
      setName(""); setChampionName(""); setChampionEmail("");
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
      className="w-full bg-white/[0.03] border border-white/10 rounded-card p-4 grid grid-cols-2 lg:grid-cols-5 gap-3 items-end">
      <label className="text-xs text-gray-mid">
        Organization
        <input className={`${inputCls} w-full mt-1`} value={name} required autoFocus
          placeholder="Roosevelt Middle School" onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="text-xs text-gray-mid">
        Type
        <select className={`${inputCls} w-full mt-1`} value={kind} onChange={(e) => setKind(e.target.value)}>
          {Object.entries(KIND_LABELS).map(([k, v]) => (
            <option key={k} value={k} className="bg-[#1d1812]">{v}</option>
          ))}
        </select>
      </label>
      <label className="text-xs text-gray-mid">
        Champion
        <input className={`${inputCls} w-full mt-1`} value={championName}
          placeholder="site coordinator / counselor" onChange={(e) => setChampionName(e.target.value)} />
      </label>
      <label className="text-xs text-gray-mid">
        Champion email
        <input className={`${inputCls} w-full mt-1`} type="email" value={championEmail}
          onChange={(e) => setChampionEmail(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={busy}
          className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50">
          {busy ? "Saving…" : "Add"}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="text-xs text-gray-mid hover:text-cream px-2">
          Cancel
        </button>
      </div>
    </form>
  );
}
