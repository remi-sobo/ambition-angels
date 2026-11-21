"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/app/admin/_components/feedback/ConfirmProvider";
import { useToast } from "@/app/admin/_components/feedback/ToastProvider";
import { saveAction } from "@/lib/admin/saveAction";
import MoreActionsMenu from "@/app/admin/_components/ui/MoreActionsMenu";
import DocumentEditModal, { type EditableDoc } from "./DocumentEditModal";

// Per-row actions for the documents hub, in one row menu (V4 Stage G).
// Edit covers the metadata (title, type, notes, expiration) without
// re-uploading the file; archive is reversible; delete is permanent (row +
// links + storage object via the API) and confirms first. Every write goes
// through saveAction, so a failure is said.
export default function DocumentActions({ doc, status }: { doc: EditableDoc; status: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const name = doc.title || doc.filename;

  const archive = async () => {
    setBusy(true);
    const next = status === "archived" ? "active" : "archived";
    const r = await saveAction({
      request: { url: `/api/admin/documents/${doc.id}`, method: "PATCH", body: { status: next } },
      success: next === "archived" ? "Document archived" : "Document restored",
      toast,
    });
    setBusy(false);
    if (r.ok) router.refresh();
  };

  const remove = async () => {
    const ok = await confirm({
      title: "Delete this document everywhere?",
      body: "The file and all its record links are removed.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    const r = await saveAction({
      request: { url: `/api/admin/documents/${doc.id}`, method: "DELETE" },
      success: "Document deleted",
      toast,
    });
    setBusy(false);
    if (r.ok) router.refresh();
  };

  return (
    <>
      <MoreActionsMenu
        label={`Actions for ${name}`}
        size="sm"
        disabled={busy}
        items={[
          { label: "Open", href: `/api/admin/documents/${doc.id}/url` },
          { label: "Edit details", onSelect: () => setEditing(true) },
          { label: status === "archived" ? "Unarchive" : "Archive", onSelect: archive },
          { label: "Delete", danger: true, onSelect: remove },
        ]}
      />
      {editing && <DocumentEditModal doc={doc} onClose={() => setEditing(false)} />}
    </>
  );
}
