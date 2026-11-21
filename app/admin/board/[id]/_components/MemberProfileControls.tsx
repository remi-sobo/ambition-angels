"use client";

// Client pieces of the board member profile: the full-field edit form the
// roster row never had (name/email/phone/affiliation/terms/bio/notes), COI +
// status quick actions, and the onboarding checklist (same optimistic jsonb
// pattern as the compliance details panel). Mutations go through
// PATCH /api/admin/board/members/[id], then router.refresh().

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/admin/_components/feedback/ToastProvider";
import { saveAction } from "@/lib/admin/saveAction";
import Button from "@/app/admin/_components/ui/Button";
import Drawer from "@/app/admin/_components/ui/Drawer";
import Input from "@/app/admin/_components/ui/Input";
import { DateField, SelectField, TextField, TextareaField } from "@/app/admin/_components/ui/Field";
import { TYPE } from "@/lib/admin/typeScale";
import { ROLE_LABELS } from "./labels";

export type ChecklistItem = { id: string; text: string; done: boolean };

export type BoardMemberFull = {
  id: string;
  constituent_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  affiliation: string | null;
  bio: string | null;
  notes: string | null;
  officer_role: string;
  term_start: string | null;
  term_end: string | null;
  term_number: number;
  coi_signed_at: string | null;
  status: string;
  checklist: ChecklistItem[] | null;
};


const STATUS_OPTIONS: Array<[string, string]> = [
  ["active", "Active"],
  ["emeritus", "Emeritus"],
  ["past", "Past"],
];

// Every write goes through saveAction (V4 Stage G); callers decide how to
// show the sentence (inline on a form, a toast on a quick action).
async function patchMember(id: string, fields: Record<string, unknown>): Promise<string | null> {
  const r = await saveAction({ request: { url: `/api/admin/board/members/${id}`, method: "PATCH", body: fields }, failure: false });
  return r.ok ? null : r.message;
}

export function EditMemberProfile({ member }: { member: BoardMemberFull }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState(member.name);
  const [email, setEmail] = useState(member.email ?? "");
  const [phone, setPhone] = useState(member.phone ?? "");
  const [affiliation, setAffiliation] = useState(member.affiliation ?? "");
  const [role, setRole] = useState(member.officer_role);
  const [status, setStatus] = useState(member.status);
  const [termStart, setTermStart] = useState(member.term_start ?? "");
  const [termEnd, setTermEnd] = useState(member.term_end ?? "");
  const [termNumber, setTermNumber] = useState(String(member.term_number));
  const [bio, setBio] = useState(member.bio ?? "");
  const [notes, setNotes] = useState(member.notes ?? "");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setBusy(true);
    setError("");
    const err = await patchMember(member.id, {
      name: name.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      affiliation: affiliation.trim() || null,
      officer_role: role,
      status,
      term_start: termStart || null,
      term_end: termEnd || null,
      term_number: Math.max(1, parseInt(termNumber, 10) || 1),
      bio: bio.trim() || null,
      notes: notes.trim() || null,
    });
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Edit profile
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={`Edit ${member.name}`}
        width={560}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form={`edit-member-${member.id}`} loading={busy}>
              {busy ? "Saving" : "Save"}
            </Button>
          </>
        }
      >
        <form id={`edit-member-${member.id}`} onSubmit={submit} className="grid grid-cols-2 gap-4">
          <TextField className="col-span-2" label="Name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} error={error || undefined} />
          <TextField label="Email" type="email" value={email} hint="Links giving automatically" onChange={(e) => setEmail(e.target.value)} />
          <TextField label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <TextField className="col-span-2" label="Affiliation" value={affiliation} placeholder="Employer or organization" onChange={(e) => setAffiliation(e.target.value)} />
          <SelectField label="Officer role" value={role} onChange={(e) => setRole(e.target.value)} options={Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))} />
          <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={STATUS_OPTIONS.map(([value, label]) => ({ value, label }))} />
          <DateField label="Term starts" value={termStart} onChange={(e) => setTermStart(e.target.value)} />
          <DateField label="Term ends" value={termEnd} onChange={(e) => setTermEnd(e.target.value)} />
          <TextField label="Term number" type="number" min={1} value={termNumber} onChange={(e) => setTermNumber(e.target.value)} />
          <TextareaField className="col-span-2" label="Bio" rows={3} value={bio} placeholder="Short bio for board books and the annual report" onChange={(e) => setBio(e.target.value)} />
          <TextareaField className="col-span-2" label="Notes" rows={3} value={notes} placeholder="Internal notes: interests, intros, context" onChange={(e) => setNotes(e.target.value)} />
        </form>
      </Drawer>
    </>
  );
}

export function MemberQuickActions({ member, coiYear }: { member: BoardMemberFull; coiYear: number }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [coiDate, setCoiDate] = useState("");
  const coiCurrent = !!member.coi_signed_at && member.coi_signed_at >= `${coiYear}-01-01`;

  const patch = async (fields: Record<string, unknown>) => {
    setBusy(true);
    const err = await patchMember(member.id, fields);
    setBusy(false);
    if (err) toast.error(err);
    else router.refresh();
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!coiCurrent && (
        <span className="inline-flex items-center gap-2">
          <Input
            type="date"
            value={coiDate}
            onChange={(e) => setCoiDate(e.target.value)}
            aria-label="COI signature date (blank is today)"
            className="!w-auto"
          />
          <Button type="button" variant="secondary" onClick={() => void patch({ coi_signed_at: coiDate || true })} loading={busy}>
            Record COI ({coiDate || `today, ${coiYear}`})
          </Button>
        </span>
      )}
      {member.status === "active" ? (
        <Button type="button" variant="quiet" onClick={() => void patch({ status: "past" })} disabled={busy}>
          Mark past
        </Button>
      ) : (
        <Button type="button" variant="quiet" onClick={() => void patch({ status: "active" })} disabled={busy}>
          Reactivate
        </Button>
      )}
    </div>
  );
}

// Optimistic local copy, same reason as the compliance checklist: quick
// consecutive edits must build on the latest array, not a stale server prop.
export function OnboardingChecklist({ member }: { member: BoardMemberFull }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  // jsonb: anything but an array (an older row's {} or null) reads as empty.
  const [items, setItems] = useState<ChecklistItem[]>(Array.isArray(member.checklist) ? member.checklist : []);
  const [newText, setNewText] = useState("");

  const save = async (next: ChecklistItem[]) => {
    const before = items;
    setItems(next);
    setBusy(true);
    const err = await patchMember(member.id, { checklist: next });
    setBusy(false);
    if (err) {
      setItems(before);
      toast.error(err);
      return;
    }
    router.refresh();
  };

  const newId = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const text = newText.trim();
    if (!text) return;
    setNewText("");
    void save([...items, { id: newId(), text, done: false }]);
  };

  const doneCount = items.filter((c) => c.done).length;

  return (
    <div>
      <h3 className={`${TYPE.sectionHeader} mb-2`}>
        Onboarding checklist
        {items.length > 0 && (
          <span className="text-ink-3 normal-case tracking-normal tabular-nums"> · {doneCount}/{items.length}</span>
        )}
      </h3>
      {items.length > 0 && (
        <ul className="space-y-1 mb-2">
          {items.map((c) => (
            <li key={c.id} className="flex items-center gap-2 group">
              <input
                type="checkbox"
                aria-label={c.text}
                checked={c.done}
                disabled={busy}
                onChange={() =>
                  save(items.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)))
                }
                className="accent-orange w-3.5 h-3.5 shrink-0"
              />
              <span className={`text-xs leading-relaxed ${c.done ? "line-through text-ink-3" : "text-ink-1"}`}>
                {c.text}
              </span>
              <button
                onClick={() => save(items.filter((x) => x.id !== c.id))}
                disabled={busy}
                aria-label={`Delete "${c.text}"`}
                className="ml-auto px-1.5 text-sm leading-none text-ink-3 hover:text-expense opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex gap-2">
        <Input
          aria-label="New checklist item"
          className="flex-1"
          value={newText}
          placeholder="e.g. Signed COI · gave orientation packet · intro to staff"
          onChange={(e) => setNewText(e.target.value)}
        />
        <Button type="submit" variant="secondary" disabled={busy || !newText.trim()}>
          Add
        </Button>
      </form>
    </div>
  );
}
