"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ReedMark } from "../../../_components/reed/ReedPanel";
import { ANGLE_BADGES, ANGLE_TONES } from "@/lib/admin/strategy/angle-fields";

// Reed-led wizard for a new framing angle. Step 1: describe the angle in a
// sentence. Step 2: Reed drafts the full angle (hook → ask) and you edit every
// element before it's created. On create it writes to strategy_angles and
// appears in the editor list + the public Strategy Room — still fully editable.

type Draft = {
  name: string;
  nav_title: string;
  status_badge: string;
  tone: string;
  hook: string;
  frame: string;
  lead: string;
  funds_label: string;
  funds: string;
  want: string;
  catch_label: string;
  catch_body: string;
  ask: string;
  flag: string;
};

const EMPTY: Draft = {
  name: "", nav_title: "", status_badge: "", tone: "neutral", hook: "", frame: "", lead: "",
  funds_label: "Who funds this", funds: "", want: "", catch_label: "", catch_body: "", ask: "", flag: "",
};

const BADGE_LABEL: Record<string, string> = {
  "north-star": "North Star", proven: "Proven", building: "Building", reframed: "Reframed",
  productizing: "Productizing", "core-thesis": "Core thesis", new: "New & timely", "emerging-stub": "Emerging stub",
};

const input =
  "w-full text-sm bg-cream border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 focus:outline-none focus:border-orange/50";
const label = "block text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-1";

const asStr = (v: unknown) => (typeof v === "string" ? v : "");

export default function ReedAngleWizard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"brief" | "review">("brief");
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);

  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));

  const reset = () => { setStage("brief"); setBrief(""); setDraft(EMPTY); setOpen(false); };

  const generate = async () => {
    if (!brief.trim()) { alert("Describe the angle first."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/admin/strategy/angles/draft", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: brief.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { alert(j.error ?? `HTTP ${r.status}`); return; }
      const a = (j.angle ?? {}) as Record<string, unknown>;
      setDraft({
        name: asStr(a.name), nav_title: asStr(a.nav_title), status_badge: asStr(a.status_badge),
        tone: asStr(a.tone) || "neutral", hook: asStr(a.hook), frame: asStr(a.frame), lead: asStr(a.lead),
        funds_label: asStr(a.funds_label) || "Who funds this", funds: asStr(a.funds), want: asStr(a.want),
        catch_label: asStr(a.catch_label), catch_body: asStr(a.catch_body), ask: asStr(a.ask), flag: asStr(a.flag),
      });
      setStage("review");
    } finally { setBusy(false); }
  };

  const create = async () => {
    if (!draft.name.trim()) { alert("The angle needs a name."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/admin/strategy/angles", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 409) { alert("An angle with that name already exists."); return; }
      if (!r.ok) { alert(j.error ?? `HTTP ${r.status}`); return; }
      reset();
      router.refresh();
    } finally { setBusy(false); }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-navy hover:bg-[#19305f] px-4 py-2 rounded-full transition-colors"
      >
        <ReedMark className="w-3.5 h-3.5 text-orange-mid" />
        Draft an angle with Reed
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-start justify-center p-4 overflow-y-auto" onClick={() => !busy && reset()}>
      <div className="bg-tile border-[1.5px] border-outline rounded-card-lg p-5 w-full max-w-2xl mt-10 space-y-4 shadow-tile" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <ReedMark className="w-4 h-4 text-orange" />
          <h2 className="font-heading font-bold text-ink-1 text-sm flex-1">
            {stage === "brief" ? "Draft a framing angle with Reed" : "Review Reed's draft"}
          </h2>
          <button type="button" onClick={reset} disabled={busy} className="text-xs font-semibold text-ink-3 hover:text-ink-1 disabled:opacity-60">Close</button>
        </div>

        {stage === "brief" ? (
          <>
            <p className="text-xs text-ink-2 leading-relaxed">
              Describe the angle in a sentence or two — the audience, the thesis, the kind of funder. Reed drafts
              the full card (hook, frame, who funds it, what they want, the ask) and you edit every element before
              it&apos;s created. Nothing is saved until you click Create.
            </p>
            <textarea
              autoFocus rows={4} className={input}
              placeholder="e.g. An angle for place-based collaboratives in Atlanta — saturate one metro, prove outcomes, sell a city not a line item."
              value={brief} onChange={(e) => setBrief(e.target.value)}
            />
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={reset} disabled={busy} className="text-xs font-semibold text-ink-2 hover:text-ink-1 px-3 py-2 rounded-full disabled:opacity-60">Cancel</button>
              <button type="button" onClick={generate} disabled={busy} className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-navy hover:bg-[#19305f] px-4 py-2 rounded-full transition-colors disabled:opacity-60">
                <ReedMark className="w-3.5 h-3.5 text-orange-mid" />
                {busy ? "Reed is drafting…" : "Draft with Reed"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2"><label className={label}>Name</label><input className={input} value={draft.name} onChange={set("name")} /></div>
              <div><label className={label}>Nav title</label><input className={input} value={draft.nav_title} onChange={set("nav_title")} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>Badge</label>
                  <select className={input} value={draft.status_badge} onChange={set("status_badge")}>
                    <option value="">No badge</option>
                    {ANGLE_BADGES.map((b) => <option key={b} value={b}>{BADGE_LABEL[b] ?? b}</option>)}
                  </select>
                </div>
                <div>
                  <label className={label}>Tone</label>
                  <select className={input} value={draft.tone} onChange={set("tone")}>
                    {ANGLE_TONES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="sm:col-span-2"><label className={label}>Hook</label><input className={input} value={draft.hook} onChange={set("hook")} /></div>
              <div className="sm:col-span-2"><label className={label}>Frame</label><textarea rows={4} className={input} value={draft.frame} onChange={set("frame")} /></div>
              <div className="sm:col-span-2"><label className={label}>Lead line</label><input className={input} value={draft.lead} onChange={set("lead")} /></div>
              <div><label className={label}>Funds label</label><input className={input} value={draft.funds_label} onChange={set("funds_label")} /></div>
              <div />
              <div><label className={label}>Who funds this</label><textarea rows={3} className={input} value={draft.funds} onChange={set("funds")} /></div>
              <div><label className={label}>What they want</label><textarea rows={3} className={input} value={draft.want} onChange={set("want")} /></div>
              <div><label className={label}>Catch label (optional)</label><input className={input} value={draft.catch_label} onChange={set("catch_label")} /></div>
              <div><label className={label}>Catch body (optional)</label><textarea rows={2} className={input} value={draft.catch_body} onChange={set("catch_body")} /></div>
              <div className="sm:col-span-2"><label className={label}>The ask</label><textarea rows={2} className={input} value={draft.ask} onChange={set("ask")} /></div>
              <div className="sm:col-span-2"><label className={label}>Flag (optional)</label><input className={input} value={draft.flag} onChange={set("flag")} /></div>
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              <button type="button" onClick={() => setStage("brief")} disabled={busy} className="text-xs font-semibold text-ink-2 hover:text-ink-1 px-3 py-2 rounded-full disabled:opacity-60">← Redraft</button>
              <div className="flex items-center gap-2">
                <button type="button" onClick={reset} disabled={busy} className="text-xs font-semibold text-ink-2 hover:text-ink-1 px-3 py-2 rounded-full disabled:opacity-60">Discard</button>
                <button type="button" onClick={create} disabled={busy} className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-60">
                  {busy ? "Creating…" : "Create angle"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
