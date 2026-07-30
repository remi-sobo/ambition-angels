"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TYPE } from "@/lib/admin/typeScale";
import { DOC_TYPES, DOC_TYPE_LABEL, docTypeExpires, minExpirationISO } from "@/lib/documents/config";

export type EditableDoc = {
  id: string;
  filename: string;
  title: string | null;
  doc_type: string | null;
  notes: string | null;
  expires_at: string | null;
};

/**
 * Metadata edit dialog for a document row — title, type, notes, and (for
 * renewal-tracked types) the expiration date, without re-uploading the file.
 * Mirrors TaskEditModal's shell: dimmed backdrop, Escape to close, one PATCH
 * with every editable field on save.
 */
export default function DocumentEditModal({ doc, onClose }: { doc: EditableDoc; onClose: () => void }) {
  const router = useRouter();

  const [title, setTitle] = useState(doc.title ?? "");
  const [docType, setDocType] = useState(doc.doc_type ?? "");
  const [notes, setNotes] = useState(doc.notes ?? "");
  const [expires, setExpires] = useState(doc.expires_at ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Expiration is offered for renewal-tracked types, and stays visible on any
  // document that already carries an expiry (e.g. Reed-extracted award-letter
  // dates) so it can be corrected or cleared.
  const showExpires = docTypeExpires(docType) || doc.expires_at != null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // A NEW expiry must be a future date (same gate as upload); an unchanged
    // existing date passes so other fields stay editable on expired documents.
    if (showExpires && expires && expires !== doc.expires_at && expires < minExpirationISO()) {
      setError("Expiration date must be in the future.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const r = await fetch(`/api/admin/documents/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || null,
          doc_type: docType || null,
          notes: notes.trim() || null,
          expires_at: showExpires ? expires || null : doc.expires_at,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${r.status}`);
      }
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  }

  const inputCls =
    "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40 w-full";
  const labelCls = "text-xs text-ink-2 block";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={() => !saving && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-card border-[1.5px] border-outline bg-surface shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="min-w-0">
            <h2 className={TYPE.modalTitle}>Edit document</h2>
            <p className="text-xs text-ink-2 mt-0.5 truncate">{doc.filename}</p>
          </div>

          <label className={labelCls}>
            Title
            <input
              className={`${inputCls} mt-1`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={doc.filename}
              maxLength={200}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className={labelCls}>
              Type
              <select className={`${inputCls} mt-1`} value={docType} onChange={(e) => setDocType(e.target.value)}>
                <option value="">Type…</option>
                {DOC_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {DOC_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
            {showExpires && (
              <label className={labelCls}>
                Expiration date
                <input
                  className={`${inputCls} mt-1`}
                  type="date"
                  value={expires}
                  onChange={(e) => setExpires(e.target.value)}
                  title="Feeds the renewal queue and the expiring-soon view"
                />
              </label>
            )}
          </div>

          <label className={labelCls}>
            Notes
            <textarea
              className={`${inputCls} mt-1 min-h-[96px] resize-y`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Provider, policy number, coverage details, context…"
              maxLength={4000}
            />
          </label>

          {error && <p className="text-expense text-sm">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-xs text-ink-2 hover:text-ink-1 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-5 py-2 rounded-full transition-colors disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
