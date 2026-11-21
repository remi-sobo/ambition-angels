"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "../../_components/ui/Button";
import Badge from "../../_components/ui/Badge";
import { SelectField, TextField, CheckboxField } from "../../_components/ui/Field";
import { useSaveAction } from "../../_lib/useSaveAction";
import { CADENCES, SLOT_KINDS, SLOT_KIND_LABEL, reorderSlots, type Slot } from "@/lib/comms/formats";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * Formats: the reusable shape of a newsletter (story-bank branch,
 * FormatEditor, rebuilt on the kit). Editions keep their own copy of the
 * slots, so editing here never changes one already started.
 */

export type FormatRowView = { id: string; name: string; cadence: string; slots: Slot[]; is_archived: boolean };

const CADENCE_LABEL: Record<string, string> = { monthly: "Monthly", quarterly: "Quarterly", annual: "Yearly", adhoc: "When needed" };

function OneFormat({ format }: { format: FormatRowView }) {
  const save = useSaveAction();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(format.name);
  const [cadence, setCadence] = useState(format.cadence);
  const [slots, setSlots] = useState<Slot[]>(format.slots);
  const [busy, setBusy] = useState(false);

  const patch = async (body: Record<string, unknown>, success: string) => {
    setBusy(true);
    const r = await save({ request: { url: `/api/admin/comms/formats/${format.id}`, method: "PATCH", body }, success });
    setBusy(false);
    if (r.ok) router.refresh();
    return r.ok;
  };
  const setSlot = (i: number, s: Partial<Slot>) => setSlots((cur) => cur.map((x, j) => (j === i ? { ...x, ...s } : x)));

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className={TYPE.cardTitle}>{format.name}</p>
          <p className={TYPE.metadata}>{CADENCE_LABEL[format.cadence] ?? format.cadence} · {format.slots.length} slots: {format.slots.map((s) => s.label).join(", ")}</p>
        </div>
        <div className="flex gap-2">
          {format.is_archived && <Badge>Archived</Badge>}
          <Button variant="secondary" size="sm" onClick={() => setOpen((o) => !o)}>{open ? "Close" : "Edit"}</Button>
        </div>
      </div>
      {open && (
        <div className="mt-3 flex flex-col gap-3 rounded-control border border-hairline p-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <SelectField label="How often" options={CADENCES.map((c) => ({ value: c, label: CADENCE_LABEL[c] }))} value={cadence} onChange={(e) => setCadence(e.target.value)} />
          </div>
          <ol className="flex flex-col gap-2">
            {slots.map((s, i) => (
              <li key={s.key || `new-${i}`} className="grid grid-cols-1 sm:grid-cols-[1fr_10rem_auto] items-end gap-2 border-t border-hairline pt-2">
                <TextField label={`Slot ${i + 1}`} value={s.label} onChange={(e) => setSlot(i, { label: e.target.value })} />
                <SelectField label="Kind" options={SLOT_KINDS.map((k) => ({ value: k, label: SLOT_KIND_LABEL[k] }))} value={s.kind} onChange={(e) => setSlot(i, { kind: e.target.value as Slot["kind"] })} />
                <div className="flex flex-wrap items-center gap-1">
                  <CheckboxField label="Required" checked={s.required} onChange={(e) => setSlot(i, { required: e.target.checked })} />
                  <Button variant="quiet" size="sm" aria-label={`Move ${s.label} up`} disabled={i === 0} onClick={() => setSlots((cur) => reorderSlots(cur, i, i - 1))}>Up</Button>
                  <Button variant="quiet" size="sm" aria-label={`Remove ${s.label}`} onClick={() => setSlots((cur) => cur.filter((_, j) => j !== i))}>Remove</Button>
                </div>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button variant="quiet" size="sm" onClick={() => setSlots((cur) => [...cur, { key: "", label: "New slot", kind: "freeform", required: false }])}>+ Add slot</Button>
            <span className="flex-1" />
            <Button variant="quiet" size="sm" onClick={() => void patch({ is_archived: !format.is_archived }, format.is_archived ? "Restored." : "Archived.")}>
              {format.is_archived ? "Restore" : "Archive"}
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={busy}
              onClick={async () => {
                if (await patch({ name, cadence, slots }, "Format saved.")) setOpen(false);
              }}
            >
              Save format
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

export default function FormatEditor({ formats }: { formats: FormatRowView[] }) {
  const save = useSaveAction();
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <ul className="divide-y divide-hairline">{formats.map((f) => <OneFormat key={f.id} format={f} />)}</ul>
      <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-hairline pt-3">
        <TextField label="New format" className="flex-1 min-w-[12rem]" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Board update" />
        <Button
          variant="secondary"
          loading={busy}
          disabled={!name.trim()}
          onClick={async () => {
            setBusy(true);
            const r = await save({ request: { url: "/api/admin/comms/formats", method: "POST", body: { name } }, success: "Format added. Edit its slots." });
            setBusy(false);
            if (r.ok) {
              setName("");
              router.refresh();
            }
          }}
        >
          Add format
        </Button>
      </div>
    </div>
  );
}
