"use client";

// Epic D2 — add / remove a soft credit on a gift, inline in the donor's
// activity timeline. Recognition only — never affects revenue rollups.

import { useState } from "react";
import { useRouter } from "next/navigation";

const TYPES = [
  ["solicitor", "Solicitor"],
  ["household", "Household"],
  ["daf_advisor", "DAF advisor"],
  ["match_originator", "Match originator"],
] as const;

export const SC_TYPE_LABEL: Record<string, string> = Object.fromEntries(TYPES);

const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-2 py-1 text-ink-1 text-xs placeholder-ink-3 focus:outline-none focus:border-orange/40";

export function AddSoftCredit({ giftId }: { giftId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("solicitor");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/gifts/${giftId}/soft-credits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ constituent_name: name.trim(), type }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(j.error ?? `HTTP ${res.status}`);
        return;
      }
      if (j.warning) alert(j.warning);
      setName("");
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[11px] font-semibold text-ink-3 hover:text-orange transition-colors"
      >
        + soft credit
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="flex items-center gap-1.5">
      <input
        autoFocus value={name} onChange={(e) => setName(e.target.value)}
        placeholder="Credit who?" className={inputCls + " w-32"}
      />
      <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
        {TYPES.map(([v, l]) => (
          <option key={v} value={v} className="bg-tile shadow-tile">{l}</option>
        ))}
      </select>
      <button type="submit" disabled={busy} className="text-[11px] font-semibold text-orange hover:text-orange-dark transition-colors disabled:opacity-50">
        {busy ? "…" : "Add"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-[11px] text-ink-3 hover:text-ink-1 transition-colors">
        ✕
      </button>
    </form>
  );
}

export function SoftCreditChip({
  giftId,
  id,
  label,
}: {
  giftId: string;
  id: string;
  label: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <span className="group/sc inline-flex items-center gap-1 text-[11px] bg-tile border-[1.5px] border-outline rounded-full pl-2.5 pr-1.5 py-0.5 text-ink-2">
      {label}
      <button
        disabled={busy}
        title="Remove soft credit"
        onClick={async () => {
          setBusy(true);
          try {
            const res = await fetch(`/api/admin/gifts/${giftId}/soft-credits?soft_credit_id=${id}`, { method: "DELETE" });
            if (!res.ok) {
              const j = await res.json().catch(() => ({}));
              alert(j.error ?? `HTTP ${res.status}`);
              return;
            }
            router.refresh();
          } finally {
            setBusy(false);
          }
        }}
        className="text-ink-3 hover:text-expense transition-colors disabled:opacity-50"
      >
        ✕
      </button>
    </span>
  );
}
