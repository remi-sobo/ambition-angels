"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { TYPE } from "@/lib/admin/typeScale";
import { TASK_CATEGORIES, categoryLabel } from "@/app/admin/ops/_types/ops";
import { useAssignees, withSelected } from "../../_lib/useAssignees";
import { DEST_LABEL, cardText, type CardDest, type CardView } from "../_lib/cardView";
import { useFocusTrap } from "../_lib/useFocusTrap";

/**
 * Edit a proposed or held card (C3 edit route; fields match EditPatch in
 * lib/capture/edit.ts). The server re-runs the parse's per-destination rules,
 * so this sheet only collects words; it never decides what is valid.
 */

const KINDS = ["call", "meeting", "note", "event"] as const;
const DESTS: CardDest[] = ["interaction", "task", "thought", "message_draft"];

const str = (v: unknown) => (typeof v === "string" ? v : "");

const inputCls =
  "w-full min-h-[52px] rounded-control border-hairline bg-tile px-3 text-base text-ink-1 placeholder-ink-3 focus:border-orange/50 focus:outline-none sm:text-sm";

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
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);

  // Escape is handled on the sheet itself and stopped there, so it closes
  // this sheet without also closing the record modal underneath.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (!saving) onClose();
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

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

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center sm:px-4"
      onClick={() => !saving && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Edit card"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border-hairline bg-ink p-5 shadow-2xl sm:max-w-md sm:rounded-panel"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <h2 className={`${TYPE.modalTitle} mb-4`}>Edit card</h2>
        <div className="space-y-4">
          <Field label="Where it goes">
            <select value={dest} onChange={(e) => setDest(e.target.value as CardDest)} className={inputCls}>
              {DESTS.map((d) => (
                <option key={d} value={d}>
                  {DEST_LABEL[d]}
                </option>
              ))}
            </select>
          </Field>

          <Field label={textLabel}>
            <textarea
              data-autofocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={dest === "task" ? 2 : 4}
              className={`${inputCls} py-2.5`}
            />
          </Field>

          {dest === "interaction" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Kind">
                <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputCls}>
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k.charAt(0).toUpperCase() + k.slice(1)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="When">
                <input type="date" value={occurred} onChange={(e) => setOccurred(e.target.value)} className={inputCls} />
              </Field>
            </div>
          )}

          {dest === "task" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Assigned to">
                  <select value={who} onChange={(e) => setWho(e.target.value)} className={inputCls}>
                    <option value="">Unassigned</option>
                    {people.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Due">
                  <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inputCls} />
                </Field>
              </div>
              <Field label="Category">
                <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
                  {TASK_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {categoryLabel(c)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Notes">
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputCls} py-2.5`} />
              </Field>
            </>
          )}

          {dest === "message_draft" && (
            <>
              <Field label="Channel">
                <select value={channel} onChange={(e) => setChannel(e.target.value)} className={inputCls}>
                  <option value="email">Email</option>
                  <option value="text">Text</option>
                </select>
              </Field>
              {channel === "email" && (
                <Field label="Subject">
                  <input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls} />
                </Field>
              )}
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

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className={`${TYPE.button} min-h-[52px] px-4 text-ink-2 hover:text-ink-1`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !text.trim()}
              className={`${TYPE.button} min-h-[52px] rounded-control bg-orange px-5 text-white transition-colors hover:bg-orange-dark disabled:opacity-50`}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className={`${TYPE.fieldLabel} mb-1 block`}>{label}</span>
      {children}
    </label>
  );
}
