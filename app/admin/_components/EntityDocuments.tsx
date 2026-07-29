"use client";

// Attach-document control (spec #2, Phase 3): a self-contained documents panel
// that hangs off any record page, same shape as EntityTasks. Lists the files
// linked to this entity, uploads a new one (auto-linked to the record via the
// upload context), opens each through the per-request signed-URL route, and
// can unlink. Deleting the file itself lives in the hub, where the blast
// radius (every linked record) is visible.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DOC_TYPES, DOC_TYPE_LABEL, docTypeExpires, minExpirationISO } from "@/lib/documents/config";
import { TYPE } from "@/lib/admin/typeScale";

type DocRow = {
  id: string;
  filename: string;
  title: string | null;
  doc_type: string | null;
  size_bytes: number | null;
  expires_at: string | null;
  created_at: string;
};

const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";

const fmtSize = (n: number | null) => {
  if (n == null) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

export function EntityDocuments({
  entityType,
  entityId,
  entityLabel,
}: {
  entityType: string;
  entityId: string;
  entityLabel: string;
}) {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [docType, setDocType] = useState("");
  const [issued, setIssued] = useState("");
  const [expires, setExpires] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const expirable = docTypeExpires(docType);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ entity_type: entityType, entity_id: entityId });
    const res = await fetch(`/api/admin/documents?${params}`);
    const j = await res.json().catch(() => ({}));
    setDocs(Array.isArray(j.documents) ? j.documents : []);
    setLoading(false);
  }, [entityType, entityId]);

  useEffect(() => {
    void load();
  }, [load]);

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
    form.set("entity_type", entityType);
    form.set("entity_id", entityId);
    if (title.trim()) form.set("title", title.trim());
    if (notes.trim()) form.set("notes", notes.trim());
    if (docType) form.set("doc_type", docType);
    if (issued) form.set("issued_at", issued);
    if (expirable && expires) form.set("expires_at", expires);
    const res = await fetch("/api/admin/documents", { method: "POST", body: form });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(j.error || "Upload failed");
      return;
    }
    setTitle("");
    setNotes("");
    setDocType("");
    setIssued("");
    setExpires("");
    if (fileRef.current) fileRef.current.value = "";
    setOpen(false);
    void load();
  };

  const unlink = async (id: string) => {
    if (busy) return;
    setBusy(true);
    const params = new URLSearchParams({ entity_type: entityType, entity_id: entityId });
    const res = await fetch(`/api/admin/documents/${id}/links?${params}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) void load();
  };

  return (
    <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-outline flex items-center justify-between gap-3">
        <h2 className={TYPE.cardTitle}>
          Documents
          {docs.length > 0 && <span className="ml-2 text-xs font-semibold text-ink-2">{docs.length}</span>}
        </h2>
        <div className="flex items-center gap-3">
          <Link href="/admin/documents" className="text-xs font-semibold text-orange hover:text-orange-mid transition-colors">
            All documents →
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-xs font-semibold px-2.5 py-1 rounded-full border border-outline text-ink-2 hover:border-orange/40 hover:text-orange transition-colors"
          >
            {open ? "Cancel" : "Attach"}
          </button>
        </div>
      </div>

      <div className="p-5">
        {open && (
          <form onSubmit={upload} className="mb-4 space-y-2">
            <input ref={fileRef} type="file" required className={`${inputCls} w-full`} aria-label={`File to attach to ${entityLabel}`} />
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title (optional)"
                className={`${inputCls} flex-1 min-w-[10rem]`}
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
              <button
                type="submit"
                disabled={busy}
                className="text-xs font-semibold px-3 py-2 rounded-lg bg-orange text-white hover:bg-orange-dark transition-colors disabled:opacity-50"
              >
                {busy ? "Uploading…" : "Upload"}
              </button>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional) — provider, policy number, context…"
              rows={2}
              maxLength={4000}
              className={`${inputCls} w-full resize-y`}
              aria-label="Notes"
            />
            {error && <p className="text-xs font-semibold text-expense">{error}</p>}
          </form>
        )}

        {loading ? (
          <p className="text-sm text-ink-2">Loading…</p>
        ) : docs.length === 0 ? (
          <p className="text-sm text-ink-2">No documents attached yet.</p>
        ) : (
          <ul className="divide-y divide-hairline -my-1">
            {docs.map((d) => (
              <li key={d.id} className="py-2.5 flex items-center gap-3">
                <a
                  href={`/api/admin/documents/${d.id}/url`}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 text-sm font-medium text-ink-1 hover:text-orange transition-colors truncate"
                >
                  {d.title || d.filename}
                </a>
                {d.doc_type && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-3 whitespace-nowrap">
                    {DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type}
                  </span>
                )}
                {d.expires_at && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-status-due-bg text-ink-1 whitespace-nowrap">
                    exp {d.expires_at}
                  </span>
                )}
                <span className="text-[11px] text-ink-3 whitespace-nowrap">{fmtSize(d.size_bytes)}</span>
                <button
                  type="button"
                  onClick={() => unlink(d.id)}
                  disabled={busy}
                  title="Unlink from this record (the file stays in the hub)"
                  className="text-[11px] font-semibold text-ink-3 hover:text-expense transition-colors disabled:opacity-50"
                >
                  Unlink
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
