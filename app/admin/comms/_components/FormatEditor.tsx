"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/app/admin/_components/Button";
import { TYPE } from "@/lib/admin/typeScale";
import {
  CADENCES,
  reorderSlots,
  SLOT_KINDS,
  SLOT_KIND_HELP,
  SLOT_KIND_LABEL,
  type Cadence,
  type Slot,
  type SlotKind,
} from "@/lib/comms/formats";
import type { FormatRow } from "@/lib/comms/editions-server";

/**
 * The format editor (spec §7.4a).
 *
 * A settings surface, one altitude down: plain and quiet, no preview theater —
 * the edition builder is the preview.
 *
 * The rule that makes this safe to use is that edits apply to FUTURE editions
 * only. An edition already in drafting carries its own snapshot of the slots
 * it was created with, so renaming "Program spotlight" to "Campus spotlight"
 * never reaches backwards into work in progress. A slot's key is generated
 * once and frozen; only its label, hint, kind, order, and required flag move.
 */

function FormatCard({ format }: { format: FormatRow }) {
  const router = useRouter();
  const [name, setName] = useState(format.name);
  const [cadence, setCadence] = useState<Cadence>(format.cadence);
  const [slots, setSlots] = useState<Slot[]>(format.slots);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const dirty =
    name !== format.name ||
    cadence !== format.cadence ||
    JSON.stringify(slots) !== JSON.stringify(format.slots);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/comms/formats/${format.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, cadence, slots }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(json?.error ?? "Could not save that.");
        return;
      }
      setNote("Saved — future editions will use this.");
      setTimeout(() => setNote(null), 3000);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function patchSlot(i: number, patch: Partial<Slot>) {
    setSlots((prev) => prev.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  }

  return (
    <li className="rounded-card-lg border border-hairline bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex flex-wrap items-center gap-2 p-4 text-left hover:bg-tile/60 rounded-card-lg"
      >
        <span className={TYPE.cardTitle}>{format.name}</span>
        <span className="text-[11px] text-ink-3">
          {format.cadence} · {format.slots.length} slots
        </span>
        <span className="ml-auto text-[11px] text-ink-3">{open ? "Close" : "Edit"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className={TYPE.cardLabel}>Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-card bg-tile border border-hairline px-3 py-2 text-sm text-ink-1 focus:outline-none focus:border-orange"
              />
            </label>
            <label className="block">
              <span className={TYPE.cardLabel}>Cadence</span>
              <select
                value={cadence}
                onChange={(e) => setCadence(e.target.value as Cadence)}
                className="mt-1 w-full rounded-card bg-tile border border-hairline px-3 py-2 text-xs text-ink-1 focus:outline-none focus:border-orange"
              >
                {CADENCES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <span className={TYPE.cardLabel}>Slots</span>
            <ul className="mt-1.5 space-y-1.5">
              {slots.map((s, i) => (
                <li
                  key={s.key}
                  draggable
                  onDragStart={() => setDragIdx(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragIdx !== null) setSlots((prev) => reorderSlots(prev, dragIdx, i));
                    setDragIdx(null);
                  }}
                  className={`rounded-card border border-hairline bg-tile p-2.5 space-y-2 ${
                    dragIdx === i ? "opacity-40" : ""
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span aria-hidden className="text-ink-3 cursor-grab select-none leading-none">
                      ⋮⋮
                    </span>
                    <input
                      value={s.label}
                      onChange={(e) => patchSlot(i, { label: e.target.value })}
                      className="flex-1 min-w-[8rem] rounded-card bg-surface border border-hairline px-2 py-1 text-xs text-ink-1 focus:outline-none focus:border-orange"
                    />
                    <select
                      value={s.kind}
                      onChange={(e) => patchSlot(i, { kind: e.target.value as SlotKind })}
                      title={SLOT_KIND_HELP[s.kind]}
                      className="rounded-card bg-surface border border-hairline px-2 py-1 text-[11px] text-ink-1 focus:outline-none focus:border-orange"
                    >
                      {SLOT_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {SLOT_KIND_LABEL[k]}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1 text-[11px] text-ink-2">
                      <input
                        type="checkbox"
                        checked={s.required}
                        onChange={(e) => patchSlot(i, { required: e.target.checked })}
                        className="accent-orange"
                      />
                      Required
                    </label>
                    <button
                      type="button"
                      aria-label={`Remove ${s.label}`}
                      onClick={() => {
                        if (slots.length === 1) {
                          setError("A format needs at least one slot.");
                          return;
                        }
                        if (confirm(`Remove "${s.label}" from future editions?`)) {
                          setSlots((prev) => prev.filter((_, k) => k !== i));
                        }
                      }}
                      className="text-ink-3 hover:text-status-critical-text text-xs"
                    >
                      ×
                    </button>
                  </div>
                  <input
                    value={s.hint ?? ""}
                    onChange={(e) => patchSlot(i, { hint: e.target.value })}
                    placeholder="Hint shown to whoever fills this slot"
                    className="w-full rounded-card bg-surface border border-hairline px-2 py-1 text-[11px] text-ink-2 placeholder:text-ink-3 focus:outline-none focus:border-orange"
                  />
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() =>
                setSlots((prev) => [
                  ...prev,
                  // No key: the API derives a stable one from the label on
                  // save. Existing keys are never re-derived.
                  { key: "", label: "New slot", kind: "freeform", required: false } as Slot,
                ])
              }
              className="mt-2 text-[11px] text-ink-2 hover:text-ink-1 underline underline-offset-2"
            >
              + Add a slot
            </button>
          </div>

          {error && (
            <p className="text-[11px] text-status-critical-text bg-status-critical-bg rounded-card px-2 py-1.5">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={!dirty || busy || !name.trim()} onClick={save}>
              Save format
            </Button>
            {note && <span className="text-[11px] text-ink-3">{note}</span>}
            {dirty && !note && (
              <span className="text-[11px] text-ink-3">
                Applies to editions created after you save. Ones already started keep their layout.
              </span>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

export default function FormatEditor({ formats }: { formats: FormatRow[] }) {
  return (
    <ul className="mt-5 space-y-2">
      {formats.map((f) => (
        <FormatCard key={f.id} format={f} />
      ))}
    </ul>
  );
}
