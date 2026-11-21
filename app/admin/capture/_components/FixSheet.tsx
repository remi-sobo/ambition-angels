"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { TYPE } from "@/lib/admin/typeScale";
import type { CandidateView } from "../_lib/cardView";
import { fixFiled, searchCandidates, type FixRequest } from "../_lib/captureApi";
import type { FixTarget } from "../_lib/fixTargets";
import Modal from "../../_components/ui/Modal";
import { TextField, TextareaField, SelectField, DateField } from "../../_components/ui/Field";

/**
 * Fix a note Capture filed (C6): edit it, move it to the right person or
 * partner, or remove it. Talks only to the card route; the server re-checks
 * the creator, the permission, and the record on every action.
 */

const KINDS = ["call", "meeting", "note", "event"] as const;

const primaryCls = `${TYPE.button} min-h-[52px] rounded-control bg-orange px-5 text-white transition-colors hover:bg-orange-dark disabled:opacity-50`;
const quietCls = `${TYPE.button} min-h-[52px] px-4 text-ink-2 hover:text-ink-1 disabled:opacity-50`;

export type FiledNote = {
  kind: string;
  /** ISO timestamp as stored. */
  occurredAt: string;
  notes: string | null;
  entityType: "constituent" | "partner";
  entityName: string;
};

type Mode = "menu" | "edit" | "move" | "remove";

export default function FixSheet({
  target,
  note,
  onClose,
  onDone,
}: {
  target: FixTarget;
  note: FiledNote;
  onClose: () => void;
  /** Called after a successful fix, with what happened. */
  onDone: (what: "revised" | "moved" | "removed") => void;
}) {
  const [mode, setMode] = useState<Mode>("menu");
  const [kind, setKind] = useState(note.kind);
  const [day, setDay] = useState(note.occurredAt.slice(0, 10));
  const [notes, setNotes] = useState(note.notes ?? "");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CandidateView[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [pick, setPick] = useState<CandidateView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const recordWord = note.entityType === "partner" ? "partner" : "person";

  // Switching panes unmounts the focused button; put focus in the new pane so
  // Tab stays in the sheet (the kit Modal's trap handles Escape).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    (el.querySelector<HTMLElement>("[data-autofocus]") ?? el).focus();
  }, [mode, pick]);

  useEffect(() => {
    if (mode !== "move") return;
    const term = q.trim();
    if (term.length < 2) {
      setResults(null);
      return;
    }
    let alive = true;
    setSearching(true);
    const t = setTimeout(async () => {
      const r = await searchCandidates(term, note.entityType);
      if (!alive) return;
      setSearching(false);
      if (r.ok) {
        setResults(r.data.candidates.filter((c) => c.kind === note.entityType));
        setError(null);
      } else {
        setResults([]);
        setError(r.error);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, mode, note.entityType]);

  const run = async (req: FixRequest, what: "revised" | "moved" | "removed") => {
    setBusy(true);
    setError(null);
    const r = await fixFiled(target.cardId, req);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onDone(what);
  };

  const saveEdit = () => {
    const patch: { kind?: string; occurred_at?: string; notes?: string | null } = {};
    if (kind !== note.kind) patch.kind = kind;
    if (day && day !== note.occurredAt.slice(0, 10)) patch.occurred_at = day;
    if (notes.trim() !== (note.notes ?? "").trim()) patch.notes = notes.trim() || null;
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    void run({ action: "revise", patch }, "revised");
  };

  const title = mode === "edit" ? "Edit note" : mode === "move" ? `Move to another ${recordWord}` : mode === "remove" ? "Remove note" : "Fix this note";

  return (
    // The kit Modal (V4 P1): the shared trap makes this the innermost layer,
    // so Escape closes this sheet and nothing under it.
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={title}
      description={`From a voice note, filed to ${note.entityName}.`}
    >
      <div ref={ref} tabIndex={-1} className="focus:outline-none">
        {mode === "menu" && (
          <div className="space-y-4">
            <div className="rounded-control border border-hairline bg-surface p-3">
              {target.sourceSentence ? (
                <p className={TYPE.body}>&ldquo;{target.sourceSentence}&rdquo;</p>
              ) : (
                <p className={TYPE.bodyMuted}>
                  {target.transcriptCleared ? "The note's transcript was cleared after 90 days." : "No source sentence was kept for this card."}
                </p>
              )}
              {!target.transcriptCleared && (
                <Link href={`/admin/capture/${target.captureId}`} className={`${TYPE.metadata} mt-2 inline-block text-orange hover:underline`}>
                  See the full note
                </Link>
              )}
            </div>
            <div className="grid gap-2">
              <MenuButton data-autofocus onClick={() => setMode("edit")} label="Edit" hint="Kind, date, or what happened" />
              <MenuButton onClick={() => setMode("move")} label={`Move to another ${recordWord}`} hint={`It went to the wrong ${recordWord}`} />
              <MenuButton onClick={() => setMode("remove")} label="Remove" hint="Take it off this record" />
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className={quietCls}>
                Close
              </button>
            </div>
          </div>
        )}

        {mode === "edit" && (
          <div className="space-y-4">
            <TextareaField label="What happened" data-autofocus value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
            <div className="grid grid-cols-2 gap-3">
              <SelectField
                label="Kind"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                options={KINDS.map((k) => ({ value: k, label: k.charAt(0).toUpperCase() + k.slice(1) }))}
              />
              <DateField label="When" value={day} onChange={(e) => setDay(e.target.value)} />
            </div>
            <Footer error={error}>
              <button type="button" onClick={() => setMode("menu")} disabled={busy} className={quietCls}>
                Back
              </button>
              <button type="button" onClick={saveEdit} disabled={busy} className={primaryCls}>
                {busy ? "Saving…" : "Save"}
              </button>
            </Footer>
          </div>
        )}

        {mode === "move" && !pick && (
          <div className="space-y-3">
            <TextField
              label="Who should it be on?"
              data-autofocus
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Type a name"
            />
            {searching && <p className={TYPE.metadata}>Searching…</p>}
            {results && results.length === 0 && !searching && !error && <p className={TYPE.metadata}>No one by that name on record.</p>}
            {results && results.length > 0 && (
              <ul className="space-y-1.5" aria-label="Records to move to">
                {results.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setPick(m)}
                      className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-control border border-hairline bg-surface px-3 py-2 text-left transition-colors hover:border-orange/60"
                    >
                      <span className="min-w-0">
                        <span className={`${TYPE.cardTitle} block truncate`}>{m.name}</span>
                        <span className={`${TYPE.metadata} block truncate`}>{[m.org_name, m.meta].filter(Boolean).join(" · ") || "On record"}</span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold text-orange">Pick</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Footer error={error}>
              <button type="button" onClick={() => setMode("menu")} className={quietCls}>
                Back
              </button>
            </Footer>
          </div>
        )}

        {mode === "move" && pick && (
          <div className="space-y-4">
            <p className={TYPE.body}>
              Move this note from <strong>{note.entityName}</strong> to <strong>{pick.name}</strong>?
            </p>
            {pick.meta && <p className={TYPE.metadata}>{[pick.org_name, pick.meta].filter(Boolean).join(" · ")}</p>}
            <Footer error={error}>
              <button type="button" onClick={() => setPick(null)} disabled={busy} className={quietCls}>
                Back
              </button>
              <button
                type="button"
                data-autofocus
                onClick={() => void run({ action: "move", entity: { type: note.entityType, id: pick.id } }, "moved")}
                disabled={busy}
                className={primaryCls}
              >
                {busy ? "Moving…" : "Move it"}
              </button>
            </Footer>
          </div>
        )}

        {mode === "remove" && (
          <div className="space-y-4">
            <p className={TYPE.body}>
              Take this note off {note.entityName}? It won&apos;t show on their record any more. The recording itself stays in your capture history.
            </p>
            <Footer error={error}>
              <button type="button" onClick={() => setMode("menu")} disabled={busy} className={quietCls}>
                Back
              </button>
              <button
                type="button"
                data-autofocus
                onClick={() => void run({ action: "remove" }, "removed")}
                disabled={busy}
                className={`${TYPE.button} min-h-[52px] rounded-control bg-expense px-5 text-white transition-opacity hover:opacity-90 disabled:opacity-50`}
              >
                {busy ? "Removing…" : "Remove"}
              </button>
            </Footer>
          </div>
        )}
      </div>
    </Modal>
  );
}

function MenuButton({
  label,
  hint,
  onClick,
  ...rest
}: {
  label: string;
  hint: string;
  onClick: () => void;
  "data-autofocus"?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...rest}
      className="flex min-h-[52px] w-full flex-col items-start justify-center rounded-control border border-hairline bg-surface px-3 py-2 text-left transition-colors hover:border-orange/60"
    >
      <span className={TYPE.cardTitle}>{label}</span>
      <span className={TYPE.metadata}>{hint}</span>
    </button>
  );
}

function Footer({ error, children }: { error: string | null; children: ReactNode }) {
  return (
    <>
      {error && (
        <p role="alert" className="text-sm text-expense">
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-3 pt-1">{children}</div>
    </>
  );
}
