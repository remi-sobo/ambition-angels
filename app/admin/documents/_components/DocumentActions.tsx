"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DocumentEditModal, { type EditableDoc } from "./DocumentEditModal";

// Per-row actions for the documents hub. Edit covers the metadata (title,
// type, notes, expiration) without re-uploading the file; archive is
// reversible; delete is permanent (row + links + storage object via the API)
// and confirms first.
export default function DocumentActions({
  doc,
  status,
}: {
  doc: EditableDoc;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true);
    await fetch(`/api/admin/documents/${doc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    router.refresh();
  };

  const remove = async () => {
    if (!window.confirm("Delete this document everywhere? The file and all its record links are removed.")) return;
    setBusy(true);
    await fetch(`/api/admin/documents/${doc.id}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  };

  const btn =
    "text-[11px] font-semibold px-2 py-0.5 rounded-full border border-outline text-ink-2 hover:text-ink-1 transition-colors disabled:opacity-50 whitespace-nowrap";

  return (
    <span className="inline-flex items-center gap-1.5">
      <button type="button" disabled={busy} onClick={() => setEditing(true)} className={btn}>
        Edit
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => patch({ status: status === "archived" ? "active" : "archived" })}
        className={btn}
      >
        {status === "archived" ? "Unarchive" : "Archive"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={remove}
        className={`${btn} hover:text-expense hover:border-expense/40`}
      >
        Delete
      </button>
      {editing && <DocumentEditModal doc={doc} onClose={() => setEditing(false)} />}
    </span>
  );
}
