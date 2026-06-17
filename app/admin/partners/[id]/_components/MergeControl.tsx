"use client";

// "Merge a duplicate into this org" — pick another partner, confirm, and it
// absorbs that org's contacts + activity, then the duplicate is deleted.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Candidate = { id: string; name: string; kind: string; city: string | null; status: string };

export function MergeControl({ keepId, keepName, candidates }: {
  keepId: string;
  keepName: string;
  candidates: Candidate[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Candidate | null>(null);

  const matches = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return [];
    return candidates
      .filter((c) => c.id !== keepId && c.name.toLowerCase().includes(n))
      .slice(0, 8);
  }, [q, candidates, keepId]);

  const doMerge = async () => {
    if (!picked) return;
    if (!confirm(`Merge "${picked.name}" into "${keepName}"? Its contacts and activity move here, and "${picked.name}" is deleted. This can't be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/partners/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keep_id: keepId, merge_id: picked.id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { alert(j.error ?? `HTTP ${res.status}`); return; }
      setOpen(false); setPicked(null); setQ("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[11px] font-semibold text-ink-3 hover:text-orange transition-colors">
        Merge duplicate
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <input
        value={picked ? picked.name : q}
        onChange={(e) => { setPicked(null); setQ(e.target.value); }}
        placeholder="Search the org to merge in…"
        className="bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40 w-full"
        autoFocus
      />
      {!picked && matches.length > 0 && (
        <ul className="border border-outline rounded-lg overflow-hidden divide-y divide-hairline">
          {matches.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => setPicked(c)}
                className="w-full text-left px-3 py-2 text-sm text-ink-1 hover:bg-tile transition-colors flex items-center gap-2"
              >
                <span className="font-medium">{c.name}</span>
                <span className="text-[11px] text-ink-3">{[c.city, c.status].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <button onClick={doMerge} disabled={!picked || busy} className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-1.5 rounded-full disabled:opacity-40">
          {busy ? "Merging…" : picked ? `Merge ${picked.name} in` : "Pick an org"}
        </button>
        <button onClick={() => { setOpen(false); setPicked(null); setQ(""); }} className="text-xs text-ink-2 hover:text-ink-1 px-2">Cancel</button>
      </div>
    </div>
  );
}
