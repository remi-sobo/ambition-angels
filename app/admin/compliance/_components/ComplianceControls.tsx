"use client";

// Client pieces of the compliance calendar (V4 Stage G): the row menu
// (start, mark filed, waive, reopen, edit in a Drawer, delete) and the New
// deadline drawer. Notes and the checklist live on the item's record page
// (/admin/organization/compliance/[id]), one click from every row. Every
// write goes through saveAction, then router.refresh().

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/admin/_components/feedback/ToastProvider";
import { useConfirm } from "@/app/admin/_components/feedback/ConfirmProvider";
import { saveAction } from "@/lib/admin/saveAction";
import Button from "@/app/admin/_components/ui/Button";
import Drawer from "@/app/admin/_components/ui/Drawer";
import MoreActionsMenu, { type MenuAction } from "@/app/admin/_components/ui/MoreActionsMenu";
import { DateField, SelectField, TextField } from "@/app/admin/_components/ui/Field";
import { useAssignees, withSelected } from "../../_lib/useAssignees";
import { normalizeAssignee } from "@/lib/admin/assignees";
import { KIND_LABELS, RECUR_OPTIONS } from "./labels";

export type ChecklistItem = { id: string; text: string; done: boolean };

export type ComplianceItem = {
  id: string;
  kind: string;
  title: string;
  jurisdiction: string | null;
  due_date: string;
  recur: string;
  status: string;
  assigned_to: string | null;
  notes: string | null;
  checklist: ChecklistItem[] | null;
  last_filed_at: string | null;
};

const KIND_OPTIONS = Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label }));
const RECUR_SELECT = RECUR_OPTIONS.map(([value, label]) => ({ value, label }));

type Draft = { title: string; kind: string; due: string; recur: string; jurisdiction: string; assignee: string };

/** The shared fields of the new and edit drawers. */
function ItemFields({ d, set, error, formId, onSubmit }: { d: Draft; set: (d: Draft) => void; error: string; formId: string; onSubmit: (e: React.FormEvent) => void }) {
  const members = useAssignees();
  return (
    <form id={formId} onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
      <TextField
        className="col-span-2"
        label="Title"
        required
        autoFocus
        value={d.title}
        placeholder="Workers' comp premium audit"
        error={error || undefined}
        onChange={(e) => set({ ...d, title: e.target.value })}
      />
      <DateField label="Due" required value={d.due} onChange={(e) => set({ ...d, due: e.target.value })} />
      <SelectField label="Repeats" value={d.recur} onChange={(e) => set({ ...d, recur: e.target.value })} options={RECUR_SELECT} />
      <SelectField label="Type" value={d.kind} onChange={(e) => set({ ...d, kind: e.target.value })} options={KIND_OPTIONS} />
      <TextField label="Jurisdiction" value={d.jurisdiction} placeholder="IRS, CA" onChange={(e) => set({ ...d, jurisdiction: e.target.value })} />
      <SelectField
        className="col-span-2"
        label="Owner"
        value={d.assignee}
        placeholder="Unassigned"
        onChange={(e) => set({ ...d, assignee: e.target.value })}
        options={withSelected(members, d.assignee)}
      />
    </form>
  );
}

export function ComplianceRowActions({ item }: { item: ComplianceItem }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const fresh = (): Draft => ({
    title: item.title,
    kind: item.kind,
    due: item.due_date,
    recur: item.recur,
    jurisdiction: item.jurisdiction ?? "",
    assignee: normalizeAssignee(item.assigned_to),
  });
  const [draft, setDraft] = useState<Draft>(fresh);

  const patch = async (fields: Record<string, unknown>, success?: string) => {
    setBusy(true);
    const r = await saveAction({ request: { url: `/api/admin/compliance/${item.id}`, method: "PATCH", body: fields }, success, toast });
    setBusy(false);
    if (r.ok) router.refresh();
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim() || !draft.due) {
      setError("Title and due date are required.");
      return;
    }
    setBusy(true);
    setError("");
    const r = await saveAction({
      request: {
        url: `/api/admin/compliance/${item.id}`,
        method: "PATCH",
        body: {
          title: draft.title.trim(),
          kind: draft.kind,
          due_date: draft.due,
          recur: draft.recur,
          jurisdiction: draft.jurisdiction.trim() || null,
          assigned_to: draft.assignee || null,
        },
      },
      failure: false,
      success: "Saved",
      toast,
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setEditing(false);
    router.refresh();
  };

  const remove = async () => {
    const ok = await confirm({ title: `Delete “${item.title}”?`, confirmLabel: "Delete", destructive: true });
    if (!ok) return;
    setBusy(true);
    const r = await saveAction({ request: { url: `/api/admin/compliance/${item.id}`, method: "DELETE" }, success: "Deleted", toast });
    setBusy(false);
    if (r.ok) router.refresh();
  };

  const openItem = item.status === "upcoming" || item.status === "in_progress";
  const items: MenuAction[] = [
    ...(item.status === "upcoming" ? [{ label: "Start", onSelect: () => void patch({ status: "in_progress" }, "Started") }] : []),
    ...(openItem
      ? [
          { label: item.recur !== "none" ? "Mark filed (rolls forward)" : "Mark filed", onSelect: () => void patch({ status: "filed" }, "Marked filed") },
          { label: "Waive", onSelect: () => void patch({ status: "waived" }, "Waived") },
        ]
      : [{ label: "Reopen", onSelect: () => void patch({ status: "upcoming" }, "Reopened") }]),
    { label: "Notes and checklist", href: `/admin/organization/compliance/${item.id}` },
    {
      label: "Edit",
      onSelect: () => {
        setDraft(fresh());
        setError("");
        setEditing(true);
      },
    },
    { label: "Delete", danger: true, onSelect: () => void remove() },
  ];

  return (
    <>
      <MoreActionsMenu label={`Actions for ${item.title}`} size="sm" disabled={busy} items={items} />
      <Drawer
        open={editing}
        onClose={() => setEditing(false)}
        title="Edit deadline"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button type="submit" form={`edit-compliance-${item.id}`} loading={busy}>
              {busy ? "Saving" : "Save"}
            </Button>
          </>
        }
      >
        <ItemFields d={draft} set={setDraft} error={error} formId={`edit-compliance-${item.id}`} onSubmit={saveEdit} />
      </Drawer>
    </>
  );
}

/** The page's one primary action: New deadline, in the kit Drawer. */
export function NewComplianceForm() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const blank: Draft = { title: "", kind: "custom", due: "", recur: "annual", jurisdiction: "", assignee: "" };
  const [draft, setDraft] = useState<Draft>(blank);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim() || !draft.due) {
      setError("Title and due date are required.");
      return;
    }
    setBusy(true);
    setError("");
    const r = await saveAction({
      request: {
        url: "/api/admin/compliance",
        method: "POST",
        body: {
          title: draft.title.trim(),
          kind: draft.kind,
          due_date: draft.due,
          recur: draft.recur,
          jurisdiction: draft.jurisdiction || undefined,
          assigned_to: draft.assignee || undefined,
        },
      },
      failure: false,
      success: "Deadline added",
      toast,
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setDraft(blank);
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        New deadline
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="New deadline"
        description="A recurring filing is one row that always shows its next due date. Marking it filed rolls it forward."
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="new-compliance" loading={busy}>
              {busy ? "Saving" : "Create"}
            </Button>
          </>
        }
      >
        <ItemFields d={draft} set={setDraft} error={error} formId="new-compliance" onSubmit={submit} />
      </Drawer>
    </>
  );
}
