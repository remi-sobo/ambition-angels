"use client";

import { useState } from "react";
import type { Blackout, MeetingType } from "@/lib/database.types";
import { TYPE } from "@/lib/admin/typeScale";

// Shared light-workspace input treatment (matches NewConnectionForm).
const inputCls =
  "w-full text-sm bg-cream border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 placeholder-ink-3 focus:outline-none focus:border-orange/50 disabled:opacity-60";

// Meeting types + blackouts, stacked — the whole configuration of the public
// booking page on one screen instead of separate tabs.
export default function BookingPageSettings({
  initialTypes,
  initialBlackouts,
}: {
  initialTypes: MeetingType[];
  initialBlackouts: Blackout[];
}) {
  const [types, setTypes] = useState(initialTypes);
  const [blackouts, setBlackouts] = useState(initialBlackouts);

  return (
    <div className="space-y-10">
      <section>
        <h2 className={`${TYPE.sectionTitle} mb-4`}>Meeting types</h2>
        <div className="space-y-4">
          {types.map((t) => (
            <TypeRow
              key={t.id}
              type={t}
              onSave={(patched) => {
                setTypes(types.map((x) => (x.id === t.id ? patched : x)));
              }}
            />
          ))}
        </div>
      </section>

      <Blackouts
        blackouts={blackouts}
        types={types}
        onChanged={(updated) => setBlackouts(updated)}
      />
    </div>
  );
}

// ── Types ────────────────────────────────────────────────────────

function TypeRow({
  type,
  onSave,
}: {
  type: MeetingType;
  onSave: (patched: MeetingType) => void;
}) {
  const [draft, setDraft] = useState({
    name: type.name,
    description: type.description ?? "",
    prep_notes: type.prep_notes ?? "",
    color: type.color ?? "#C0703C",
    duration_minutes: type.duration_minutes,
    buffer_minutes: type.buffer_minutes,
    min_notice_hours: type.min_notice_hours,
    max_advance_days: type.max_advance_days,
    is_active: type.is_active,
    location_options: type.location_options ?? ["video"],
    default_in_person_address: type.default_in_person_address ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/admin/meet/types/${type.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          default_in_person_address:
            draft.default_in_person_address.trim() || null,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setMsg(data.error ?? "Save failed");
        return;
      }
      onSave(data.meetingType);
      setMsg("Saved.");
      setTimeout(() => setMsg(null), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border-[1.5px] border-outline bg-surface shadow-panel p-5">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{ background: draft.color }}
          />
          <div>
            <div className="font-semibold text-ink-1">{type.name}</div>
            <div className="text-xs text-ink-3">/{type.slug}</div>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input
            type="checkbox"
            checked={draft.is_active}
            onChange={(e) =>
              setDraft({ ...draft, is_active: e.target.checked })
            }
          />
          Active
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Name">
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Color">
          <input
            type="color"
            value={draft.color}
            onChange={(e) => setDraft({ ...draft, color: e.target.value })}
            className="h-10 w-20 bg-transparent border-[1.5px] border-outline rounded cursor-pointer"
          />
        </Field>
        <Field label="Description">
          <input
            value={draft.description}
            onChange={(e) =>
              setDraft({ ...draft, description: e.target.value })
            }
            className={inputCls}
          />
        </Field>
        <Field label="Prep notes">
          <input
            value={draft.prep_notes}
            onChange={(e) =>
              setDraft({ ...draft, prep_notes: e.target.value })
            }
            className={inputCls}
          />
        </Field>
        <Field label="Duration (min)">
          <input
            type="number"
            value={draft.duration_minutes}
            onChange={(e) =>
              setDraft({
                ...draft,
                duration_minutes: Number(e.target.value),
              })
            }
            className={inputCls}
          />
        </Field>
        <Field label="Buffer (min)">
          <input
            type="number"
            value={draft.buffer_minutes}
            onChange={(e) =>
              setDraft({ ...draft, buffer_minutes: Number(e.target.value) })
            }
            className={inputCls}
          />
        </Field>
        <Field label="Min notice (hours)">
          <input
            type="number"
            value={draft.min_notice_hours}
            onChange={(e) =>
              setDraft({
                ...draft,
                min_notice_hours: Number(e.target.value),
              })
            }
            className={inputCls}
          />
        </Field>
        <Field label="Max advance (days)">
          <input
            type="number"
            value={draft.max_advance_days}
            onChange={(e) =>
              setDraft({
                ...draft,
                max_advance_days: Number(e.target.value),
              })
            }
            className={inputCls}
          />
        </Field>
      </div>

      <div className="mt-5 pt-5 border-t border-hairline">
        <div className="text-xs text-ink-3 uppercase tracking-widest mb-2">
          Location options
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          {(["video", "in_person"] as const).map((opt) => {
            const selected = draft.location_options.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    location_options: selected
                      ? draft.location_options.filter((o) => o !== opt)
                      : [...draft.location_options, opt],
                  })
                }
                className={[
                  "px-3 py-1.5 rounded text-xs border transition-colors",
                  selected
                    ? "bg-orange/20 text-orange border-orange/40"
                    : "bg-tile text-ink-2 border-outline hover:bg-[#EFE6D4]",
                ].join(" ")}
              >
                {opt === "video" ? "Video" : "In person"}
              </button>
            );
          })}
        </div>
        {draft.location_options.includes("in_person") ? (
          <Field label="Default in-person address (blank = ask attendee)">
            <input
              value={draft.default_in_person_address}
              onChange={(e) =>
                setDraft({ ...draft, default_in_person_address: e.target.value })
              }
              placeholder="e.g. 380 Portage Ave, Palo Alto, CA"
              className={inputCls}
            />
          </Field>
        ) : null}
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="bg-orange hover:bg-orange-dark text-white text-sm font-semibold px-4 py-2 rounded transition-colors disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {msg && <span className="text-sm text-ink-2">{msg}</span>}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-ink-3 uppercase tracking-widest mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

// ── Blackouts ────────────────────────────────────────────────────

function Blackouts({
  blackouts,
  types,
  onChanged,
}: {
  blackouts: Blackout[];
  types: MeetingType[];
  onChanged: (updated: Blackout[]) => void;
}) {
  const [draft, setDraft] = useState({
    start_date: "",
    end_date: "",
    reason: "",
    meeting_type_ids: [] as string[],
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function create() {
    setErr(null);
    setSaving(true);
    try {
      const r = await fetch("/api/admin/meet/blackouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          reason: draft.reason || undefined,
          meeting_type_ids:
            draft.meeting_type_ids.length > 0
              ? draft.meeting_type_ids
              : undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setErr(data.error ?? "Add failed");
        return;
      }
      onChanged([...blackouts, data.blackout]);
      setDraft({
        start_date: "",
        end_date: "",
        reason: "",
        meeting_type_ids: [],
      });
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this blackout?")) return;
    setBusy(id);
    try {
      const r = await fetch(`/api/admin/meet/blackouts/${id}`, {
        method: "DELETE",
      });
      if (!r.ok) {
        alert("Delete failed");
        return;
      }
      onChanged(blackouts.filter((b) => b.id !== id));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-6">
      <div className="rounded-lg border-[1.5px] border-outline bg-surface shadow-panel p-5">
        <h2 className={`${TYPE.sectionTitle} mb-4`}>Add a blackout</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Start date">
            <input
              type="date"
              value={draft.start_date}
              onChange={(e) =>
                setDraft({ ...draft, start_date: e.target.value })
              }
              className={inputCls}
            />
          </Field>
          <Field label="End date">
            <input
              type="date"
              value={draft.end_date}
              onChange={(e) =>
                setDraft({ ...draft, end_date: e.target.value })
              }
              className={inputCls}
            />
          </Field>
          <Field label="Reason (optional)">
            <input
              value={draft.reason}
              onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
              className={inputCls}
              placeholder="Out of office"
            />
          </Field>
        </div>
        <div className="mt-4">
          <span className="block text-xs text-ink-3 uppercase tracking-widest mb-2">
            Applies to (none selected = all types)
          </span>
          <div className="flex flex-wrap gap-2">
            {types.map((t) => {
              const selected = draft.meeting_type_ids.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      meeting_type_ids: selected
                        ? draft.meeting_type_ids.filter((i) => i !== t.id)
                        : [...draft.meeting_type_ids, t.id],
                    })
                  }
                  className={[
                    "px-3 py-1 rounded-full text-xs border transition-colors",
                    selected
                      ? "bg-orange/20 text-orange border-orange/40"
                      : "bg-tile text-ink-2 border-outline hover:bg-[#EFE6D4]",
                  ].join(" ")}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
        </div>
        {err && <p className="mt-3 text-sm text-expense">{err}</p>}
        <button
          type="button"
          disabled={saving || !draft.start_date || !draft.end_date}
          onClick={create}
          className="mt-5 bg-orange hover:bg-orange-dark text-white text-sm font-semibold px-4 py-2 rounded transition-colors disabled:opacity-50"
        >
          {saving ? "Adding…" : "Add blackout"}
        </button>
      </div>

      <div>
        <h2 className={`${TYPE.sectionTitle} mb-4`}>Current blackouts</h2>
        {blackouts.length === 0 ? (
          <p className="text-ink-3 text-sm">No blackouts set.</p>
        ) : (
          <ul className="space-y-2">
            {blackouts.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between gap-4 rounded-lg border-[1.5px] border-outline bg-surface shadow-panel px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-ink-1">
                    {b.start_date} → {b.end_date}
                  </div>
                  <div className="text-xs text-ink-3 truncate">
                    {b.reason ?? "no reason"}
                    {b.meeting_type_ids && b.meeting_type_ids.length > 0
                      ? ` · ${b.meeting_type_ids.length} type(s)`
                      : " · all types"}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy === b.id}
                  onClick={() => remove(b.id)}
                  className="text-xs text-expense hover:text-expense transition-colors disabled:opacity-50"
                >
                  {busy === b.id ? "Deleting…" : "Delete"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
