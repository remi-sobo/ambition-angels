"use client";

// Segments + CSV export panel for the Donors module. Filters map 1:1 to
// /api/admin/donors/export query params; "Save segment" persists the
// current filters as a named definition; segment chips export directly.

import { useEffect, useState } from "react";
import SectionHeading from "../../../_components/SectionHeading";

type Segment = {
  id: string;
  name: string;
  definition: Record<string, string>;
};

const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";

function toQuery(def: Record<string, string>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(def)) if (v) p.set(k, v);
  return p.toString();
}

export default function SegmentExportPanel() {
  const [open, setOpen] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [source, setSource] = useState("");
  const [minTotal, setMinTotal] = useState("");
  const [since, setSince] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/admin/segments")
      .then((r) => (r.ok ? r.json() : { segments: [] }))
      .then((j) => setSegments(j.segments ?? []))
      .catch(() => {});
  }, [open]);

  const def = (): Record<string, string> => ({
    q, type, source, min_total: minTotal, since,
  });

  const exportCsv = (d: Record<string, string>) => {
    window.location.href = `/api/admin/donors/export?${toQuery(d)}`;
  };

  const saveSegment = async () => {
    const name = prompt("Segment name (e.g. “$250+ donors this year”):")?.trim();
    if (!name) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, definition: def() }),
      });
      if (res.ok) {
        const r = await fetch("/api/admin/segments");
        if (r.ok) setSegments((await r.json()).segments ?? []);
      } else {
        alert("Could not save segment");
      }
    } finally {
      setBusy(false);
    }
  };

  const deleteSegment = async (id: string) => {
    if (!confirm("Delete this segment?")) return;
    await fetch(`/api/admin/segments/${id}`, { method: "DELETE" });
    setSegments((s) => s.filter((x) => x.id !== id));
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-ink-2 hover:text-ink-1 bg-tile hover:bg-[#EFE6D4] border-[1.5px] border-outline px-4 py-2 rounded-full transition-colors"
      >
        Segments & export
      </button>
    );
  }

  return (
    <div className="w-full bg-tile shadow-tile border-[1.5px] border-outline rounded-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <SectionHeading>
          Segments & CSV export
        </SectionHeading>
        <button onClick={() => setOpen(false)} className="text-xs text-ink-2 hover:text-ink-1">
          Close
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        <input className={inputCls} placeholder="Name contains…" value={q}
          onChange={(e) => setQ(e.target.value)} />
        <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Any type</option>
          <option value="person">People</option>
          <option value="organization">Organizations</option>
        </select>
        <select className={inputCls} value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">Any source</option>
          <option value="stripe">Stripe</option>
          <option value="hubspot_import">HubSpot import</option>
          <option value="manual">Manual</option>
        </select>
        <input className={inputCls} type="number" min="0" placeholder="Min lifetime $"
          value={minTotal} onChange={(e) => setMinTotal(e.target.value)} />
        <input className={inputCls} type="date" title="Gave on/after"
          value={since} onChange={(e) => setSince(e.target.value)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => exportCsv(def())}
          className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors"
        >
          Export CSV
        </button>
        <button
          onClick={() => void saveSegment()}
          disabled={busy}
          className="text-xs font-semibold text-ink-1 hover:text-ink-1 bg-tile hover:bg-[#EFE6D4] border-[1.5px] border-outline px-4 py-2 rounded-full transition-colors disabled:opacity-50"
        >
          Save as segment
        </button>
        {segments.map((s) => (
          <span
            key={s.id}
            className="inline-flex items-center gap-1.5 text-xs bg-tile border-[1.5px] border-outline rounded-full pl-3 pr-1.5 py-1"
          >
            <button
              onClick={() => exportCsv(s.definition)}
              title={`Export “${s.name}”`}
              className="text-ink-1 hover:text-orange transition-colors"
            >
              {s.name}
            </button>
            <button
              onClick={() => void deleteSegment(s.id)}
              title="Delete segment"
              className="w-4 h-4 rounded-full text-ink-2 hover:text-expense leading-none"
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
