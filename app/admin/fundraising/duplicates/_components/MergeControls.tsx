"use client";

// Epic M1 — pick the record to keep for a duplicate group, then merge the rest
// into it. Destructive, so it confirms and shows what's being kept.

import { useState } from "react";
import { useRouter } from "next/navigation";

export type DupMember = { id: string; name: string; email: string; gifts: number; total: string };

export default function MergeControls({ members }: { members: DupMember[] }) {
  const router = useRouter();
  const [primary, setPrimary] = useState(members[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const merge = async () => {
    const others = members.filter((m) => m.id !== primary);
    if (others.length === 0) return;
    const keep = members.find((m) => m.id === primary);
    if (!confirm(`Merge ${others.length} record${others.length === 1 ? "" : "s"} into "${keep?.name}"? This reassigns all their gifts/history and deletes the duplicates. Can't be undone.`)) return;
    setBusy(true);
    setError("");
    try {
      for (const o of others) {
        const res = await fetch("/api/admin/constituents/merge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ primary_id: primary, duplicate_id: o.id }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Merge failed");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
              <input type="radio" name={`primary-${members[0].id}`} checked={primary === m.id} onChange={() => setPrimary(m.id)} className="accent-orange" />
              <span className="text-sm text-ink-1 truncate">{m.name}</span>
              <span className="text-[11px] text-ink-3 truncate">{m.email}</span>
            </label>
            <span className="text-[11px] text-ink-2 [font-variant-numeric:tabular-nums] flex-shrink-0">
              {m.gifts} gift{m.gifts === 1 ? "" : "s"} · {m.total}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3">
        <button
          disabled={busy}
          onClick={merge}
          className="text-[11px] font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
        >
          {busy ? "Merging…" : "Keep selected · merge rest"}
        </button>
        {error && <span className="text-expense text-[11px]">{error}</span>}
      </div>
    </div>
  );
}
