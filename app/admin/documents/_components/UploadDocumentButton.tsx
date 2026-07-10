"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DOC_TYPES, DOC_TYPE_LABEL } from "@/lib/documents/config";

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
  const [docType, setDocType] = useState("");
  const [expires, setExpires] = useState("");
  const [restricted, setRestricted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("file", file);
    if (title.trim()) form.set("title", title.trim());
    if (docType) form.set("doc_type", docType);
    if (expires) form.set("expires_at", expires);
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
    setDocType("");
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
      <input
        type="date"
        value={expires}
        onChange={(e) => setExpires(e.target.value)}
        className={inputCls}
        aria-label="Expires on"
        title="Expires on (feeds the renewal queue)"
      />
      <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-2">
        <input type="checkbox" checked={restricted} onChange={(e) => setRestricted(e.target.checked)} />
        Restricted
      </label>
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
