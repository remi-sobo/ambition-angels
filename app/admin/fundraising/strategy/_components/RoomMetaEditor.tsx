"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Editor for the Strategy Room's presentation copy — the hero (eyebrow,
// headline, accent, subtitle), the stat chips, and the "what we're doing this
// year" block. One row per org (strategy_room_meta); the whole thing saves at
// once via PUT, since the stat / year lists are easiest to edit as a set.

type Stat = { value: string; label: string };
type YearItem = { label: string; body: string };

export type RoomMetaInput = {
  eyebrow: string;
  headline: string;
  headline_accent: string;
  subtitle: string;
  stats: Stat[];
  this_year_heading: string;
  year_intro: string;
  this_year: YearItem[];
};

const input =
  "w-full text-sm bg-cream border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 focus:outline-none focus:border-orange/50";
const label = "block text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-1";

export default function RoomMetaEditor({ meta }: { meta: RoomMetaInput }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [f, setF] = useState<RoomMetaInput>(meta);

  const set = <K extends keyof RoomMetaInput>(k: K, v: RoomMetaInput[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    setDirty(true);
  };
  const setStat = (i: number, k: keyof Stat, v: string) =>
    set("stats", f.stats.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  const setYear = (i: number, k: keyof YearItem, v: string) =>
    set("this_year", f.this_year.map((y, j) => (j === i ? { ...y, [k]: v } : y)));

  const save = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/strategy/room-meta", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { alert(j.error ?? `HTTP ${r.status}`); return; }
      setDirty(false);
      router.refresh();
    } finally { setBusy(false); }
  };

  return (
    <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg mb-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <div>
          <h2 className="font-heading font-bold text-ink-1 text-sm">Strategy Room presentation</h2>
          <p className="text-[11px] text-ink-3 mt-0.5">The hero, the stat chips, and the “this year” block at the top of the public deck.</p>
        </div>
        <span className="text-ink-3 text-sm shrink-0">{open ? "Hide" : "Edit"}</span>
      </button>

      {open && (
        <div className={`px-5 pb-5 space-y-4 ${busy ? "opacity-60" : ""}`}>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className={label}>Eyebrow</label><input className={input} value={f.eyebrow} onChange={(e) => set("eyebrow", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={label}>Headline</label><input className={input} value={f.headline} onChange={(e) => set("headline", e.target.value)} /></div>
              <div><label className={label}>Headline accent (orange)</label><input className={input} value={f.headline_accent} onChange={(e) => set("headline_accent", e.target.value)} /></div>
            </div>
            <div className="sm:col-span-2"><label className={label}>Subtitle</label><textarea rows={2} className={input} value={f.subtitle} onChange={(e) => set("subtitle", e.target.value)} /></div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className={label + " mb-0"}>Stat chips</p>
              <button type="button" onClick={() => set("stats", [...f.stats, { value: "", label: "" }])} className="text-[11px] font-semibold text-orange hover:text-orange-dark">+ Add stat</button>
            </div>
            <div className="space-y-2">
              {f.stats.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input className={`${input} w-28`} placeholder="3,500+" value={s.value} onChange={(e) => setStat(i, "value", e.target.value)} />
                  <input className={`${input} flex-1`} placeholder="teens reached" value={s.label} onChange={(e) => setStat(i, "label", e.target.value)} />
                  <button type="button" onClick={() => set("stats", f.stats.filter((_, j) => j !== i))} className="text-ink-3 hover:text-expense text-sm px-1 shrink-0" aria-label="Remove stat">×</button>
                </div>
              ))}
              {f.stats.length === 0 && <p className="text-xs text-ink-3 italic">No stat chips.</p>}
            </div>
          </div>

          <div className="border-t border-outline pt-4 grid sm:grid-cols-2 gap-3">
            <div><label className={label}>“This year” heading</label><input className={input} value={f.this_year_heading} onChange={(e) => set("this_year_heading", e.target.value)} /></div>
            <div><label className={label}>“This year” intro</label><textarea rows={2} className={input} value={f.year_intro} onChange={(e) => set("year_intro", e.target.value)} /></div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className={label + " mb-0"}>“This year” items</p>
              <button type="button" onClick={() => set("this_year", [...f.this_year, { label: "", body: "" }])} className="text-[11px] font-semibold text-orange hover:text-orange-dark">+ Add item</button>
            </div>
            <div className="space-y-2">
              {f.this_year.map((y, i) => (
                <div key={i} className="flex items-start gap-2">
                  <input className={`${input} w-36`} placeholder="Exposure" value={y.label} onChange={(e) => setYear(i, "label", e.target.value)} />
                  <textarea rows={2} className={`${input} flex-1`} placeholder="What this layer is…" value={y.body} onChange={(e) => setYear(i, "body", e.target.value)} />
                  <button type="button" onClick={() => set("this_year", f.this_year.filter((_, j) => j !== i))} className="text-ink-3 hover:text-expense text-sm px-1 shrink-0 pt-2" aria-label="Remove item">×</button>
                </div>
              ))}
              {f.this_year.length === 0 && <p className="text-xs text-ink-3 italic">No items.</p>}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            {dirty && <span className="text-[11px] text-ink-3">Unsaved changes</span>}
            <button type="button" onClick={save} disabled={busy || !dirty} className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50">
              {busy ? "Saving…" : "Save presentation"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
