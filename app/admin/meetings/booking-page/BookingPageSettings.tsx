"use client";

import { useState } from "react";
import { useToast } from "@/app/admin/_components/feedback/ToastProvider";
import { useConfirm } from "@/app/admin/_components/feedback/ConfirmProvider";
import type { Blackout, MeetingType } from "@/lib/database.types";
import { TYPE } from "@/lib/admin/typeScale";
import { saveAction } from "@/lib/admin/saveAction";
import Button from "@/app/admin/_components/ui/Button";
import { Field } from "@/app/admin/_components/ui/Input";
import { CheckboxField, DateField, TextField } from "@/app/admin/_components/ui/Field";

// V4 Stage G: Settings archetype, kit fields with real labels and every
// save through saveAction.

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
    const r = await saveAction<{ meetingType: MeetingType }>({
      request: {
        url: `/api/admin/meet/types/${type.id}`,
        method: "PATCH",
        body: { ...draft, default_in_person_address: draft.default_in_person_address.trim() || null },
      },
      failure: false,
    });
    setSaving(false);
    if (!r.ok) {
      setMsg(r.message);
      return;
    }
    onSave(r.data.meetingType);
    setMsg("Saved.");
    setTimeout(() => setMsg(null), 2000);
  }

  return (
    <div className="rounded-control border-hairline bg-surface p-5">
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
        <CheckboxField
          label="Active"
          checked={draft.is_active}
          onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TextField
          label="Name"
          controlSize="md"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        <Field label="Color" htmlFor={`color-${type.id}`}>
          <input
            id={`color-${type.id}`}
            type="color"
            value={draft.color}
            onChange={(e) => setDraft({ ...draft, color: e.target.value })}
            className="h-10 w-20 bg-transparent border border-hairline rounded-control cursor-pointer"
          />
        </Field>
        <TextField
          label="Description"
          controlSize="md"
            value={draft.description}
            onChange={(e) =>
              setDraft({ ...draft, description: e.target.value })
            }
        />
        <TextField
          label="Prep notes"
          controlSize="md"
            value={draft.prep_notes}
            onChange={(e) =>
              setDraft({ ...draft, prep_notes: e.target.value })
            }
        />
        <TextField
          label="Duration (min)"
          controlSize="md"
            type="number"
            value={draft.duration_minutes}
            onChange={(e) =>
              setDraft({
                ...draft,
                duration_minutes: Number(e.target.value),
              })
            }
        />
        <TextField
          label="Buffer (min)"
          controlSize="md"
            type="number"
            value={draft.buffer_minutes}
            onChange={(e) =>
              setDraft({ ...draft, buffer_minutes: Number(e.target.value) })
            }
        />
        <TextField
          label="Min notice (hours)"
          controlSize="md"
            type="number"
            value={draft.min_notice_hours}
            onChange={(e) =>
              setDraft({
                ...draft,
                min_notice_hours: Number(e.target.value),
              })
            }
        />
        <TextField
          label="Max advance (days)"
          controlSize="md"
            type="number"
            value={draft.max_advance_days}
            onChange={(e) =>
              setDraft({
                ...draft,
                max_advance_days: Number(e.target.value),
              })
            }
        />
      </div>

      <div className="mt-5 pt-5 border-t border-hairline">
        <div className={`${TYPE.cardLabel} mb-2`}>
          Location options
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          {(["video", "in_person"] as const).map((opt) => {
            const selected = draft.location_options.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                aria-pressed={selected}
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
                    ? "bg-accent-soft text-orange-dark border-orange/40"
                    : "bg-tile text-ink-2 border-hairline hover:bg-tile",
                ].join(" ")}
              >
                {opt === "video" ? "Video" : "In person"}
              </button>
            );
          })}
        </div>
        {draft.location_options.includes("in_person") ? (
          <TextField
            label="Default in-person address (blank = ask attendee)"
            controlSize="md"
              value={draft.default_in_person_address}
              onChange={(e) =>
                setDraft({ ...draft, default_in_person_address: e.target.value })
              }
              placeholder="e.g. 380 Portage Ave, Palo Alto, CA"
          />
        ) : null}
      </div>

      <div className="mt-5 flex items-center gap-3">
        <Button type="button" onClick={save} loading={saving}>
          {saving ? "Saving" : "Save"}
        </Button>
        {msg && <span className="text-sm text-ink-2">{msg}</span>}
      </div>
    </div>
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
  const toast = useToast();
  const confirm = useConfirm();
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
    const r = await saveAction<{ blackout: Blackout }>({
      request: {
        url: "/api/admin/meet/blackouts",
        method: "POST",
        body: {
          ...draft,
          reason: draft.reason || undefined,
          meeting_type_ids: draft.meeting_type_ids.length > 0 ? draft.meeting_type_ids : undefined,
        },
      },
      failure: false,
    });
    setSaving(false);
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    onChanged([...blackouts, r.data.blackout]);
    setDraft({ start_date: "", end_date: "", reason: "", meeting_type_ids: [] });
  }

  async function remove(id: string) {
    const ok = await confirm({
      title: "Delete this blackout?",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setBusy(id);
    const r = await saveAction({
      request: { url: `/api/admin/meet/blackouts/${id}`, method: "DELETE" },
      failure: "Couldn't delete the blackout. Try again.",
      toast,
    });
    setBusy(null);
    if (r.ok) onChanged(blackouts.filter((b) => b.id !== id));
  }

  return (
    <section className="space-y-6">
      <div className="rounded-control border-hairline bg-surface p-5">
        <h2 className={`${TYPE.sectionTitle} mb-4`}>Add a blackout</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <DateField
            label="Start date"
            controlSize="md"
              
              value={draft.start_date}
              onChange={(e) =>
                setDraft({ ...draft, start_date: e.target.value })
              }
          />
          <DateField
            label="End date"
            controlSize="md"
              
              value={draft.end_date}
              onChange={(e) =>
                setDraft({ ...draft, end_date: e.target.value })
              }
          />
          <TextField
            label="Reason (optional)"
            controlSize="md"
              value={draft.reason}
              onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
              placeholder="Out of office"
          />
        </div>
        <div className="mt-4">
          <span className={`block ${TYPE.fieldLabel} mb-2`}>
            Applies to (none selected = all types)
          </span>
          <div className="flex flex-wrap gap-2">
            {types.map((t) => {
              const selected = draft.meeting_type_ids.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={selected}
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
                      ? "bg-accent-soft text-orange-dark border-orange/40"
                      : "bg-tile text-ink-2 border-hairline hover:bg-tile",
                  ].join(" ")}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
        </div>
        {err && <p className="mt-3 text-sm text-expense">{err}</p>}
        <Button type="button" variant="secondary" className="mt-5" disabled={!draft.start_date || !draft.end_date} onClick={create} loading={saving}>
          {saving ? "Adding" : "Add blackout"}
        </Button>
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
                className="flex items-center justify-between gap-4 rounded-control border-hairline bg-surface px-4 py-3"
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
