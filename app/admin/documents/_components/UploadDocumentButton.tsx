"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveAction } from "@/lib/admin/saveAction";
import { useToast } from "@/app/admin/_components/feedback/ToastProvider";
import Drawer from "@/app/admin/_components/ui/Drawer";
import Button from "@/app/admin/_components/ui/Button";
import { Field } from "@/app/admin/_components/ui/Input";
import { CheckboxField, DateField, SelectField, TextField, TextareaField } from "@/app/admin/_components/ui/Field";
import { DOC_TYPES, DOC_TYPE_LABEL, docTypeExpires, minExpirationISO } from "@/lib/documents/config";

// Hub upload: same POST as the record-page attach control, minus the
// auto-link context. Links can be added afterwards from any record page.
// V4 Stage G: the page's one primary action, in the kit Drawer; the upload
// goes through saveAction (multipart, so the request is a function).
export default function UploadDocumentButton() {
  const router = useRouter();
  const toast = useToast();
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

  const reset = () => {
    setTitle("");
    setNotes("");
    setDocType("");
    setIssued("");
    setExpires("");
    setRestricted(false);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (busy) return;
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
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
    const r = await saveAction({
      request: () => fetch("/api/admin/documents", { method: "POST", body: form }),
      failure: false,
      success: "Document uploaded",
      toast,
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setOpen(false);
    reset();
    router.refresh();
  };

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Upload document
      </Button>
      <Drawer
        open={open}
        onClose={() => !busy && setOpen(false)}
        title="Upload a document"
        description="Only the file is required. Attach it to records from their pages afterwards."
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form="upload-document-form" loading={busy}>
              {busy ? "Uploading" : "Upload"}
            </Button>
          </>
        }
      >
        <form id="upload-document-form" onSubmit={upload} className="grid grid-cols-2 gap-4">
          <Field label="File" htmlFor="upload-document-file" required className="col-span-2">
            <input
              ref={fileRef}
              id="upload-document-file"
              type="file"
              required
              className="block w-full text-sm text-ink-1 file:mr-3 file:h-9 file:px-3 file:rounded-control file:border file:border-outline file:bg-surface file:text-ink-1"
            />
          </Field>
          <TextField className="col-span-2" label="Title" hint="Defaults to the filename" value={title} onChange={(e) => setTitle(e.target.value)} />
          <SelectField
            label="Type"
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            placeholder="Choose a type"
            options={DOC_TYPES.map((t) => ({ value: t, label: DOC_TYPE_LABEL[t] }))}
          />
          <DateField label="Issue date" hint="When it was created or approved" value={issued} onChange={(e) => setIssued(e.target.value)} />
          {expirable ? (
            <DateField
              className="col-span-2"
              label="Expiration date"
              hint="A future date; feeds the renewal queue"
              value={expires}
              min={minExpirationISO()}
              onChange={(e) => setExpires(e.target.value)}
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
            rows={3}
            maxLength={4000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Provider, policy number, context"
          />
          {error ? (
            <p role="alert" className="col-span-2 text-sm font-medium text-status-critical-text">
              {error}
            </p>
          ) : null}
        </form>
      </Drawer>
    </>
  );
}
