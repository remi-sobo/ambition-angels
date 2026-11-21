"use client";

import { useState } from "react";
import { TYPE } from "@/lib/admin/typeScale";
import { TASK_CATEGORIES, categoryLabel } from "@/app/admin/ops/_types/ops";
import { useAssignees, withSelected } from "../../_lib/useAssignees";
import { DEST_LABEL, cardText, type CardDest, type CardView } from "../_lib/cardView";
import Modal from "../../_components/ui/Modal";
import Button from "../../_components/ui/Button";
import { TextField, TextareaField, SelectField, DateField } from "../../_components/ui/Field";

/**
 * Edit a proposed or held card (C3 edit route; fields match EditPatch in
 * lib/capture/edit.ts). The server re-runs the parse's per-destination rules,
 * so this sheet only collects words; it never decides what is valid.
 */

const KINDS = ["call", "meeting", "note", "event"] as const;
const DESTS: CardDest[] = ["interaction", "task", "thought", "message_draft"];

const str = (v: unknown) => (typeof v === "string" ? v : "");

export default function EditSheet({
  card,
  onClose,
  onSave,
}: {
  card: CardView;
  onClose: () => void;
  /** Resolves to an error message, or null when saved. */
  onSave: (patch: Record<string, unknown>) => Promise<string | null>;
}) {
  const p = card.payload;
  const assignee = (p.assignee as { handle?: string } | null | undefined)?.handle ?? "";
  const [dest, setDest] = useState<CardDest>(card.dest);
  const [text, setText] = useState(cardText(card));
  const [notes, setNotes] = useState(card.dest === "task" ? str(p.notes) : "");
  const [kind, setKind] = useState(str(p.kind) || "note");
  const [occurred, setOccurred] = useState(str(p.occurred_at));
  const [category, setCategory] = useState(str(p.category) || "other");
  const [due, setDue] = useState(str(p.due_date));
  const [who, setWho] = useState(assignee);
  const [channel, setChannel] = useState(str(p.channel) || "email");
  const [subject, setSubject] = useState(str(p.subject));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const people = withSelected(useAssignees(), who);

  const save = async () => {
    const patch: Record<string, unknown> = {};
    if (dest !== card.dest) patch.dest = dest;
    if (dest === "interaction") {
      patch.notes = text;
      patch.kind = kind;
      if (occurred) patch.occurred_at = occurred;
    } else if (dest === "task") {
      patch.title = text;
      patch.notes = notes || null;
      patch.category = category;
      patch.due = due || null;
      patch.assignee = who || null;
    } else if (dest === "thought") {
      patch.text = text;
    } else {
      patch.body = text;
      patch.channel = channel;
      if (channel === "email") patch.subject = subject || null;
    }
    setSaving(true);
    setError(null);
    const err = await onSave(patch);
    setSaving(false);
    if (err) setError(err);
  };

  const textLabel = dest === "interaction" ? "What happened" : dest === "task" ? "Task" : dest === "thought" ? "Thought" : "Message";

  // The kit Modal (V4 P1): the shared trap makes this the innermost layer, so
  // Escape closes this sheet without also closing the record modal under it.
  return (
    <Modal
      open
      onClose={() => !saving && onClose()}
      title="Edit card"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving || !text.trim()} loading={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <SelectField
          label="Where it goes"
          value={dest}
          onChange={(e) => setDest(e.target.value as CardDest)}
          options={DESTS.map((d) => ({ value: d, label: DEST_LABEL[d] }))}
        />

        <TextareaField
          label={textLabel}
          data-autofocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={dest === "task" ? 2 : 4}
        />

        {dest === "interaction" && (
          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="Kind"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              options={KINDS.map((k) => ({ value: k, label: k.charAt(0).toUpperCase() + k.slice(1) }))}
            />
            <DateField label="When" value={occurred} onChange={(e) => setOccurred(e.target.value)} />
          </div>
        )}

        {dest === "task" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <SelectField
                label="Assigned to"
                value={who}
                onChange={(e) => setWho(e.target.value)}
                placeholder="Unassigned"
                options={people.map((a) => ({ value: a.value, label: a.label }))}
              />
              <DateField label="Due" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
            <SelectField
              label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              options={TASK_CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) }))}
            />
            <TextareaField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </>
        )}

        {dest === "message_draft" && (
          <>
            <SelectField
              label="Channel"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              options={[
                { value: "email", label: "Email" },
                { value: "text", label: "Text" },
              ]}
            />
            {channel === "email" && <TextField label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />}
          </>
        )}

        {dest === "interaction" && !card.entity_id && (
          <p className={TYPE.metadata}>An interaction needs a person or partner. Pick one on the card after saving.</p>
        )}

        {error && (
          <p role="alert" className="text-sm text-expense">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
