"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DOC_TYPES, DOC_TYPE_LABEL, docTypeExpires, minExpirationISO } from "@/lib/documents/config";

const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";

// Hub upload: same POST as the record-page attach control, minus the
// auto-link context. Links can be added afterwards from any record page.
export default function UploadDocumentButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [docType, setDocType] = useState("");
  const [issued, setIssued] = useState("");
  const [expires, setExpires] = useState("");
  const [restricted, setRestricted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const expirable = docTypeExpires(docType);

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file || busy) return;
    if (expirable && expires && expires < minExpirationISO()) {
      setError("Expiration date must be in the future.");
      return;
    }
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("file", file);
    if (title.trim()) form.set("title", title.trim());
    if (notes.trim()) form.set("notes", notes.trim());
    if (docType) form.set("doc_type", docType);
    if (issued) form.set("issued_at", issued);
    if (expirable && expires) form.set("expires_at", expires);
    if (restricted) form.set("visibility", "restricted");
    const res = await fetch("/api/admin/documents", { method: "POST", body: form });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(j.error || "Upload failed");
      return;
    }
    setOpen(false);
    setTitle("");
    setNotes("");
    setDocType("");
    setIssued("");
    setExpires("");
    setRestricted(false);
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-semibold px-4 py-2 rounded-full bg-orange text-white hover:bg-orange-dark transition-colors"
      >
        Upload document
      </button>
    );
  }

  return (
    <form
      onSubmit={upload}
      className="flex flex-wrap items-center gap-2 bg-surface border-[1.5px] border-outline rounded-card p-3"
    >
      <input ref={fileRef} type="file" required className={inputCls} aria-label="File to upload" />
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        className={`${inputCls} w-40`}
      />
      <select value={docType} onChange={(e) => setDocType(e.target.value)} className={inputCls} aria-label="Document type">
        <option value="">Type…</option>
        {DOC_TYPES.map((t) => (
          <option key={t} value={t}>
            {DOC_TYPE_LABEL[t]}
          </option>
        ))}
      </select>
      <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-2">
        Issue date
        <input
          type="date"
          value={issued}
          onChange={(e) => setIssued(e.target.value)}
          className={inputCls}
          aria-label="Issue date"
          title="When the document was created or approved"
        />
      </label>
      {expirable && (
        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-2">
          Expiration date
          <input
            type="date"
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
            min={minExpirationISO()}
            className={inputCls}
            aria-label="Expiration date"
            title="Must be a future date (feeds the renewal queue)"
          />
        </label>
      )}
      <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-2">
        <input type="checkbox" checked={restricted} onChange={(e) => setRestricted(e.target.checked)} />
        Restricted
      </label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional) — provider, policy number, context…"
        rows={2}
        maxLength={4000}
        className={`${inputCls} w-full resize-y`}
        aria-label="Notes"
      />
      <button
        type="submit"
        disabled={busy}
        className="text-sm font-semibold px-4 py-2 rounded-full bg-orange text-white hover:bg-orange-dark transition-colors disabled:opacity-50"
      >
        {busy ? "Uploading…" : "Upload"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-sm font-semibold px-3 py-2 rounded-full border border-outline text-ink-2 hover:text-ink-1 transition-colors"
      >
        Cancel
      </button>
      {error && <p className="w-full text-xs font-semibold text-expense">{error}</p>}
    </form>
  );
}
