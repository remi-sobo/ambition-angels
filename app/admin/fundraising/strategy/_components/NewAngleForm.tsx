"use client";

// Create a new funding angle (Phase 3). Inserts into strategy_angles via the
// admin route; the key is slugified server-side and it appends after the last
// angle. Name is required; the rest are the same fields the cards render.

import { useState } from "react";
import { useRouter } from "next/navigation";

const BADGES = [
  ["", "No badge"],
  ["north-star", "North Star"],
  ["proven", "Proven"],
  ["building", "Building"],
  ["reframed", "Reframed"],
  ["productizing", "Productizing"],
  ["core-thesis", "Core thesis"],
  ["new", "New & timely"],
  ["emerging-stub", "Emerging stub"],
] as const;

const input =
  "w-full text-sm bg-cream border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 focus:outline-none focus:border-orange/50";

export default function NewAngleForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: "", status_badge: "", hook: "", funds: "", want: "", ask: "", approach: "" });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = async () => {
    if (!f.name.trim()) {
      alert("Name is required.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/admin/strategy/angles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 409) {
        alert("An angle with that name already exists.");
        return;
      }
      if (!r.ok) throw new Error(d?.error ?? "Failed");
      setF({ name: "", status_badge: "", hook: "", funds: "", want: "", ask: "", approach: "" });
      setOpen(false);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not create angle.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors"
      >
        + New angle
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-start justify-center p-4 overflow-y-auto" onClick={() => !busy && setOpen(false)}>
      <div
        className="bg-tile border-[1.5px] border-outline rounded-card-lg p-5 w-full max-w-lg mt-12 space-y-3 shadow-tile"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-heading font-bold text-ink-1 text-sm">New funding angle</h2>
        <input className={input} placeholder="Name *" value={f.name} onChange={set("name")} />
        <select className={input} value={f.status_badge} onChange={set("status_badge")}>
          {BADGES.map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
        <input className={input} placeholder="Hook — the north-star one-liner" value={f.hook} onChange={set("hook")} />
        <textarea className={input} rows={2} placeholder="Who funds this" value={f.funds} onChange={set("funds")} />
        <textarea className={input} rows={2} placeholder="What they want" value={f.want} onChange={set("want")} />
        <input className={input} placeholder="Ask range / model" value={f.ask} onChange={set("ask")} />
        <textarea className={input} rows={2} placeholder="Approach — cold vs warm note (optional)" value={f.approach} onChange={set("approach")} />
        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={() => setOpen(false)} disabled={busy} className="text-xs font-semibold text-ink-2 hover:text-ink-1 px-3 py-2 rounded-full disabled:opacity-60">
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={busy} className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-60">
            {busy ? "Creating…" : "Create angle"}
          </button>
        </div>
      </div>
    </div>
  );
}
