"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveAction } from "@/lib/admin/saveAction";
import { useToast } from "@/app/admin/_components/feedback/ToastProvider";
import Drawer from "@/app/admin/_components/ui/Drawer";
import Button from "@/app/admin/_components/ui/Button";
import { CheckboxField, DateField, SelectField, TextField, TextareaField } from "@/app/admin/_components/ui/Field";
import { DOC_TYPES, DOC_TYPE_LABEL, docTypeExpires, minExpirationISO } from "@/lib/documents/config";

export type EditableDoc = {
  id: string;
  filename: string;
  title: string | null;
  doc_type: string | null;
  notes: string | null;
  issued_at: string | null;
  expires_at: string | null;
  visibility: string;
};

/**
 * Metadata edit dialog for a document row — every field the upload form sets
 * (title, type, notes, issue date, restricted) plus, for renewal-tracked
 * types, the expiration date, without re-uploading the file. The kit Drawer
 * (V4 Stage G): focus trap, Escape, phone sheet; one PATCH through
 * saveAction with every editable field on save.
 */
export default function DocumentEditModal({ doc, onClose }: { doc: EditableDoc; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();

  const [title, setTitle] = useState(doc.title ?? "");
  const [docType, setDocType] = useState(doc.doc_type ?? "");
  const [notes, setNotes] = useState(doc.notes ?? "");
  const [issued, setIssued] = useState(doc.issued_at ?? "");
  const [expires, setExpires] = useState(doc.expires_at ?? "");
  const [restricted, setRestricted] = useState(doc.visibility === "restricted");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Expiration is offered for renewal-tracked types, and stays visible on any
  // document that already carries an expiry (e.g. Reed-extracted award-letter
  // dates) so it can be corrected or cleared.
  const showExpires = docTypeExpires(docType) || doc.expires_at != null;

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
    const r = await saveAction({
      request: {
        url: `/api/admin/documents/${doc.id}`,
        method: "PATCH",
        body: {
          title: title.trim() || null,
          doc_type: docType || null,
          notes: notes.trim() || null,
          issued_at: issued || null,
          expires_at: showExpires ? expires || null : doc.expires_at,
          visibility: restricted ? "restricted" : "org",
        },
      },
      failure: false,
      success: "Document saved",
      toast,
    });
    setSaving(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <Drawer
      open
      onClose={() => !saving && onClose()}
      title="Edit document"
      description={doc.filename}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form={`edit-doc-${doc.id}`} loading={saving}>
            {saving ? "Saving" : "Save"}
          </Button>
        </>
      }
    >
      <form id={`edit-doc-${doc.id}`} onSubmit={submit} className="grid grid-cols-2 gap-4">
        <TextField className="col-span-2" label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={doc.filename} maxLength={200} />
        <SelectField
          label="Type"
          value={docType}
          onChange={(e) => setDocType(e.target.value)}
          placeholder="Choose a type"
          options={DOC_TYPES.map((t) => ({ value: t, label: DOC_TYPE_LABEL[t] }))}
        />
        <DateField label="Issue date" hint="When it was created or approved" value={issued} onChange={(e) => setIssued(e.target.value)} />
        {showExpires ? (
          <DateField
            className="col-span-2"
            label="Expiration date"
            hint="Feeds the renewal queue and the expiring-soon view"
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
            error={error && /Expiration/.test(error) ? error : undefined}
          />
        ) : null}
        <CheckboxField
          className="col-span-2"
          label="Restricted"
          hint="Hide from the board and other limited-access roles"
          checked={restricted}
          onChange={(e) => setRestricted(e.target.checked)}
        />
        <TextareaField
          className="col-span-2"
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Provider, policy number, coverage details, context"
          maxLength={4000}
        />
        {error && !/Expiration/.test(error) ? (
          <p role="alert" className="col-span-2 text-sm font-medium text-status-critical-text">
            {error}
          </p>
        ) : null}
      </form>
    </Drawer>
  );
}
