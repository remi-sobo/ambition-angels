"use client";

// Client pieces of the board member profile: the full-field edit form the
// roster row never had (name/email/phone/affiliation/terms/bio/notes), COI +
// status quick actions, and the onboarding checklist (same optimistic jsonb
// pattern as the compliance details panel). Mutations go through
// PATCH /api/admin/board/members/[id], then router.refresh().

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TYPE } from "@/lib/admin/typeScale";

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

const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";

export const ROLE_LABELS: Record<string, string> = {
  chair: "Chair",
  vice_chair: "Vice Chair",
  secretary: "Secretary",
  treasurer: "Treasurer",
  member: "Member",
};

const STATUS_OPTIONS: Array<[string, string]> = [
  ["active", "Active"],
  ["emeritus", "Emeritus"],
  ["past", "Past"],
];

async function patchMember(id: string, fields: Record<string, unknown>): Promise<string | null> {
  const res = await fetch(`/api/admin/board/members/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    return (j.error as string) ?? `HTTP ${res.status}`;
  }
  return null;
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

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-ink-2 hover:text-orange transition-colors"
      >
        Edit
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="col-span-full grid grid-cols-2 gap-3 text-left">
      <label className="col-span-2 text-xs text-ink-2">
        Name
        <input className={`${inputCls} w-full mt-1`} value={name} required autoFocus
          onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="text-xs text-ink-2">
        Email
        <input className={`${inputCls} w-full mt-1`} type="email" value={email}
          placeholder="links giving automatically" onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="text-xs text-ink-2">
        Phone
        <input className={`${inputCls} w-full mt-1`} value={phone}
          onChange={(e) => setPhone(e.target.value)} />
      </label>
      <label className="col-span-2 text-xs text-ink-2">
        Affiliation
        <input className={`${inputCls} w-full mt-1`} value={affiliation}
          placeholder="Employer / organization" onChange={(e) => setAffiliation(e.target.value)} />
      </label>
      <label className="text-xs text-ink-2">
        Officer role
        <select className={`${inputCls} w-full mt-1`} value={role} onChange={(e) => setRole(e.target.value)}>
          {Object.entries(ROLE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </label>
      <label className="text-xs text-ink-2">
        Status
        <select className={`${inputCls} w-full mt-1`} value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </label>
      <label className="text-xs text-ink-2">
        Term starts
        <input className={`${inputCls} w-full mt-1`} type="date" value={termStart}
          onChange={(e) => setTermStart(e.target.value)} />
      </label>
      <label className="text-xs text-ink-2">
        Term ends
        <input className={`${inputCls} w-full mt-1`} type="date" value={termEnd}
          onChange={(e) => setTermEnd(e.target.value)} />
      </label>
      <label className="text-xs text-ink-2">
        Term #
        <input className={`${inputCls} w-full mt-1`} type="number" min={1} value={termNumber}
          onChange={(e) => setTermNumber(e.target.value)} />
      </label>
      <label className="col-span-2 text-xs text-ink-2">
        Bio
        <textarea className={`${inputCls} w-full mt-1 leading-relaxed`} rows={3} value={bio}
          placeholder="Short bio for board books and the annual report"
          onChange={(e) => setBio(e.target.value)} />
      </label>
      <label className="col-span-2 text-xs text-ink-2">
        Notes
        <textarea className={`${inputCls} w-full mt-1 leading-relaxed`} rows={3} value={notes}
          placeholder="Internal notes — interests, intros, context"
          onChange={(e) => setNotes(e.target.value)} />
      </label>
      <div className="col-span-2 flex gap-2 items-center">
        <button type="submit" disabled={busy}
          className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50">
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="text-xs text-ink-2 hover:text-ink-1 px-2">
          Cancel
        </button>
        {error && <p className="text-expense text-xs">{error}</p>}
      </div>
    </form>
  );
}

export function MemberQuickActions({ member, coiYear }: { member: BoardMemberFull; coiYear: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [coiDate, setCoiDate] = useState("");
  const coiCurrent = !!member.coi_signed_at && member.coi_signed_at >= `${coiYear}-01-01`;

  const patch = async (fields: Record<string, unknown>) => {
    setBusy(true);
    const err = await patchMember(member.id, fields);
    setBusy(false);
    if (err) alert(err);
    router.refresh();
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!coiCurrent && (
        <>
          <button
            onClick={() => void patch({ coi_signed_at: coiDate || true })}
            disabled={busy}
            className="px-3 py-1.5 rounded-full text-[11px] font-semibold bg-orange/15 text-orange hover:bg-orange/25"
          >
            Record COI ({coiDate || `today, ${coiYear}`})
          </button>
          <input
            type="date"
            value={coiDate}
            onChange={(e) => setCoiDate(e.target.value)}
            aria-label="COI signature date"
            className={`${inputCls} !py-1 !text-xs`}
          />
        </>
      )}
      {member.status === "active" ? (
        <button
          onClick={() => void patch({ status: "past" })}
          disabled={busy}
          className="px-3 py-1.5 rounded-full text-[11px] bg-tile hover:bg-[#EFE6D4] text-ink-2"
        >
          Mark past
        </button>
      ) : (
        <button
          onClick={() => void patch({ status: "active" })}
          disabled={busy}
          className="px-3 py-1.5 rounded-full text-[11px] bg-tile hover:bg-[#EFE6D4] text-ink-2"
        >
          Reactivate
        </button>
      )}
    </div>
  );
}

// Optimistic local copy, same reason as the compliance checklist: quick
// consecutive edits must build on the latest array, not a stale server prop.
export function OnboardingChecklist({ member }: { member: BoardMemberFull }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<ChecklistItem[]>(member.checklist ?? []);
  const [newText, setNewText] = useState("");

  const save = async (next: ChecklistItem[]) => {
    setItems(next);
    setBusy(true);
    const err = await patchMember(member.id, { checklist: next });
    setBusy(false);
    if (err) alert(err);
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
                checked={c.done}
                disabled={busy}
                onChange={() =>
                  save(items.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)))
                }
                className="accent-orange w-3.5 h-3.5 shrink-0"
              />
              <span className={`text-[12px] leading-relaxed ${c.done ? "line-through text-ink-3" : "text-ink-1"}`}>
                {c.text}
              </span>
              <button
                onClick={() => save(items.filter((x) => x.id !== c.id))}
                disabled={busy}
                aria-label={`Delete "${c.text}"`}
                className="ml-auto px-1.5 text-[13px] leading-none text-ink-3 hover:text-expense opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex gap-2">
        <input
          className={`${inputCls} flex-1 !py-1.5 text-[12px]`}
          value={newText}
          placeholder="e.g. Signed COI · gave orientation packet · intro to staff"
          onChange={(e) => setNewText(e.target.value)}
        />
        <button
          type="submit"
          disabled={busy || !newText.trim()}
          className="text-[11px] font-semibold px-3 rounded-md bg-tile hover:bg-[#EFE6D4] text-ink-2 disabled:opacity-50"
        >
          Add
        </button>
      </form>
    </div>
  );
}
