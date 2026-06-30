"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ANGLE_BADGES, ANGLE_TONES } from "@/lib/admin/strategy/angle-fields";

// One strategy/framing angle, fully editable in place. Every element commits to
// PATCH /api/admin/strategy/angles/[id] on blur/change; the public Strategy Room
// (app/strategy) reads the same row, so an edit here shows there on next load.

export type AdminAngle = {
  id: string;
  key: string;
  name: string;
  nav_title: string | null;
  status_badge: string | null;
  tone: string | null;
  hook: string | null;
  frame: string | null;
  lead: string | null;
  funds_label: string | null;
  funds: string | null;
  want: string | null;
  catch_label: string | null;
  catch_body: string | null;
  ask: string | null;
  flag: string | null;
  approach: string | null;
  sort_order: number;
  is_active: boolean;
};

const BADGE_LABEL: Record<string, string> = {
  "north-star": "North Star", proven: "Proven", building: "Building", reframed: "Reframed",
  productizing: "Productizing", "core-thesis": "Core thesis", new: "New & timely", "emerging-stub": "Emerging stub",
};

const inputCls =
  "w-full text-sm bg-cream border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 focus:outline-none focus:border-orange/50";

async function patchAngle(id: string, fields: Record<string, unknown>): Promise<boolean> {
  const r = await fetch(`/api/admin/strategy/angles/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    alert(j.error ?? `HTTP ${r.status}`);
    return false;
  }
  return true;
}

// Click-to-edit text field. Commits on blur / Enter (Esc cancels). Empty clears
// to null. Renders as a labeled block so the long fields read as a deck.
function EditField({
  label, value, field, angleId, multiline = false, placeholder = "—",
}: {
  label: string;
  value: string | null;
  field: string;
  angleId: string;
  multiline?: boolean;
  placeholder?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(value ?? ""), [value]);

  const commit = async () => {
    setEditing(false);
    const next = draft.trim() === "" ? null : draft.trim();
    if (next === (value ?? null)) { setDraft(value ?? ""); return; }
    setBusy(true);
    try { if (await patchAngle(angleId, { [field]: next })) router.refresh(); else setDraft(value ?? ""); }
    finally { setBusy(false); }
  };
  const cancel = () => { setDraft(value ?? ""); setEditing(false); };

  return (
    <div className={busy ? "opacity-60" : ""}>
      <p className="text-ink-3 uppercase tracking-wider font-semibold text-[10px] mb-0.5">{label}</p>
      {editing ? (
        multiline ? (
          <textarea
            autoFocus rows={3} className={inputCls} value={draft}
            onChange={(e) => setDraft(e.target.value)} onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Escape") cancel(); }}
          />
        ) : (
          <input
            autoFocus className={inputCls} value={draft}
            onChange={(e) => setDraft(e.target.value)} onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void commit(); } if (e.key === "Escape") cancel(); }}
          />
        )
      ) : (
        <button
          type="button" onClick={() => setEditing(true)}
          className="text-left w-full text-sm text-ink-2 leading-snug hover:text-ink-1 hover:underline decoration-dotted underline-offset-2"
        >
          {value && value.trim() ? value : <span className="text-ink-3 italic">{placeholder}</span>}
        </button>
      )}
    </div>
  );
}

export default function AngleEditorCard({ angle, funderCount }: { angle: AdminAngle; funderCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const patch = async (fields: Record<string, unknown>) => {
    setBusy(true);
    try { if (await patchAngle(angle.id, fields)) router.refresh(); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!confirm(`Delete the “${angle.name}” angle? This removes it from the Strategy Room.`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/strategy/angles/${angle.id}`, { method: "DELETE" });
      if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.error ?? `HTTP ${r.status}`); }
      else router.refresh();
    } finally { setBusy(false); }
  };

  return (
    <section className={`bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-5 space-y-4 ${busy ? "opacity-60" : ""} ${angle.is_active ? "" : "opacity-70"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-baseline gap-2.5 min-w-0 flex-1">
          <span className="text-[11px] font-bold text-ink-3 [font-variant-numeric:tabular-nums] pt-0.5">
            {String(angle.sort_order).padStart(2, "0")}
          </span>
          <div className="min-w-0 flex-1">
            <EditField label="Angle name" field="name" value={angle.name} angleId={angle.id} placeholder="Untitled angle" />
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <select
            value={angle.status_badge ?? ""}
            onChange={(e) => void patch({ status_badge: e.target.value || null })}
            aria-label="Status badge"
            className="text-[10px] font-semibold rounded-full px-2 py-0.5 border border-outline bg-cream text-ink-2 cursor-pointer"
          >
            <option value="">No badge</option>
            {ANGLE_BADGES.map((b) => <option key={b} value={b}>{BADGE_LABEL[b] ?? b}</option>)}
          </select>
          <select
            value={angle.tone ?? "neutral"}
            onChange={(e) => void patch({ tone: e.target.value })}
            aria-label="Tone"
            title="Card accent tone in the Strategy Room"
            className="text-[10px] font-semibold rounded-full px-2 py-0.5 border border-outline bg-cream text-ink-2 cursor-pointer"
          >
            {ANGLE_TONES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <EditField label="Hook — the line you say out loud" field="hook" value={angle.hook} angleId={angle.id} placeholder="Add a hook" />
      <EditField label="Nav title — short label for the jump nav" field="nav_title" value={angle.nav_title} angleId={angle.id} placeholder="Defaults to the name" />
      <EditField label="Frame — the case, in our voice" field="frame" value={angle.frame} angleId={angle.id} multiline placeholder="Add the framing paragraph" />
      <EditField label="Lead — a single quotable line" field="lead" value={angle.lead} angleId={angle.id} placeholder="Add a lead line" />

      <div className="grid sm:grid-cols-2 gap-4 border-t border-outline pt-4">
        <EditField label={angle.funds_label || "Who funds this"} field="funds" value={angle.funds} angleId={angle.id} multiline placeholder="Named funders / buyers" />
        <EditField label="What they want to see" field="want" value={angle.want} angleId={angle.id} multiline placeholder="The metrics they want" />
      </div>
      <EditField label="Funds label (e.g. “Who funds this” / “Who buys this”)" field="funds_label" value={angle.funds_label} angleId={angle.id} placeholder="Who funds this" />

      <div className="grid sm:grid-cols-2 gap-4 border-t border-outline pt-4">
        <EditField label="Catch label (optional)" field="catch_label" value={angle.catch_label} angleId={angle.id} placeholder="e.g. The catch" />
        <EditField label="Catch body (optional)" field="catch_body" value={angle.catch_body} angleId={angle.id} multiline placeholder="The caveat, if any" />
      </div>

      <div className="border-t border-outline pt-4">
        <EditField label="The ask" field="ask" value={angle.ask} angleId={angle.id} multiline placeholder="Range, structure, what to request" />
        <div className="mt-3">
          <EditField label="Flag (optional caution)" field="flag" value={angle.flag} angleId={angle.id} placeholder="e.g. a number to pressure-test" />
        </div>
        <div className="mt-3">
          <EditField label="Approach (internal note — not shown in the Strategy Room)" field="approach" value={angle.approach ?? null} angleId={angle.id} multiline placeholder="Cold vs warm reachability note" />
        </div>
      </div>

      <div className="border-t border-outline pt-3 flex items-center justify-between text-[11px]">
        <label className="flex items-center gap-1.5 text-ink-2 cursor-pointer">
          <input type="checkbox" checked={angle.is_active} onChange={(e) => void patch({ is_active: e.target.checked })} className="accent-orange" />
          {angle.is_active ? "Shown in the Strategy Room" : "Hidden (inactive)"}
        </label>
        <div className="flex items-center gap-3">
          <span className="text-ink-3">{funderCount} funder{funderCount === 1 ? "" : "s"}</span>
          <Link href={`/admin/fundraising/strategy/${angle.key}`} className="font-semibold text-ink-2 hover:text-orange transition-colors">
            Open funnel →
          </Link>
          <button onClick={() => void remove()} className="font-semibold text-ink-3 hover:text-expense transition-colors">Delete</button>
        </div>
      </div>
    </section>
  );
}
