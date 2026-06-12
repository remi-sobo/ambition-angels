"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputCls =
  "bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-cream text-xs placeholder-gray-mid focus:outline-none focus:border-orange/40";

export function TargetEditor({
  metricKey,
  target,
  owner,
}: {
  metricKey: string;
  target: number | null;
  owner: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [t, setT] = useState(target?.toString() ?? "");
  const [o, setO] = useState(owner ?? "");

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/kpis/${metricKey}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: t === "" ? null : Number(t), owner: o || null }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? `HTTP ${res.status}`);
      }
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
        className="text-[11px] text-gray-mid hover:text-cream px-2 py-1 rounded-md bg-white/5 hover:bg-white/10"
      >
        {owner ? owner : "Set target"}
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <input className={`${inputCls} w-24`} type="number" placeholder="target" value={t}
        onChange={(e) => setT(e.target.value)} autoFocus />
      <input className={`${inputCls} w-20`} placeholder="owner" value={o}
        onChange={(e) => setO(e.target.value)} />
      <button onClick={() => void save()} disabled={busy}
        className="text-[11px] font-semibold text-white bg-orange hover:bg-orange-dark px-2.5 py-1 rounded-full disabled:opacity-50">
        Save
      </button>
      <button onClick={() => setOpen(false)} className="text-[11px] text-gray-mid hover:text-cream">×</button>
    </span>
  );
}
