"use client";

// Client pieces of the student profile: stage controls (select / advance /
// log activity, same behavior as the roster row) and the full edit form —
// identity columns plus the org's registry-driven custom fields. Mutations
// go through the existing PATCH /api/admin/students/[id], then
// router.refresh().

import { useState } from "react";
import { useRouter } from "next/navigation";
import CustomFields, { type CustomValues } from "../../_components/CustomFields";
import type { CustomFieldDef } from "@/lib/admin/customFields";
import type { Student, StageOption, LeaderOption } from "../../_components/StudentControls";

const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";

async function patchStudent(id: string, fields: Record<string, unknown>): Promise<string | null> {
  const res = await fetch(`/api/admin/students/${id}`, {
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

export function StageControls({ student, stages }: { student: Student; stages: StageOption[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const patch = async (fields: Record<string, unknown>) => {
    setBusy(true);
    const err = await patchStudent(student.id, fields);
    setBusy(false);
    if (err) alert(err);
    router.refresh();
  };

  const journey = stages.filter((s) => !s.terminal);
  const stageIdx = journey.findIndex((s) => s.stage_key === student.stage);
  const next = stageIdx >= 0 && stageIdx < journey.length - 1 ? journey[stageIdx + 1] : null;
  const labelOf = (key: string) => stages.find((s) => s.stage_key === key)?.label ?? key;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={student.stage}
        disabled={busy}
        onChange={(e) => patch({ stage: e.target.value })}
        title={stages.find((s) => s.stage_key === student.stage)?.description ?? undefined}
        className="text-[11px] bg-tile border-[1.5px] border-outline rounded-md px-2 py-1 text-ink-1 cursor-pointer"
      >
        {stages.map((s) => (
          <option key={s.stage_key} value={s.stage_key} className="bg-surface" title={s.description ?? undefined}>
            {s.label}
          </option>
        ))}
        {!stages.some((s) => s.stage_key === student.stage) && (
          <option value={student.stage} className="bg-surface">{labelOf(student.stage)}</option>
        )}
      </select>
      {next && (
        <button
          onClick={() => patch({ stage: next.stage_key, touch: true })}
          disabled={busy}
          title={next.description ?? undefined}
          className="px-3 py-1.5 rounded-full text-[11px] font-semibold bg-orange/15 text-orange hover:bg-orange/25"
        >
          Advance → {next.label}
        </button>
      )}
      <button
        onClick={() => patch({ touch: true })}
        disabled={busy}
        className="px-3 py-1.5 rounded-full text-[11px] bg-tile hover:bg-[#EFE6D4] text-ink-2"
      >
        Log activity
      </button>
    </div>
  );
}

export function EditStudentProfile({
  student,
  defs,
  term,
  leaders,
  volunteerTerm,
}: {
  student: Student;
  defs: CustomFieldDef[];
  term: string;
  leaders: LeaderOption[];
  volunteerTerm: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [firstName, setFirstName] = useState(student.first_name);
  const [lastName, setLastName] = useState(student.last_name ?? "");
  const [email, setEmail] = useState(student.email ?? "");
  const [phone, setPhone] = useState(student.phone ?? "");
  const [location, setLocation] = useState(student.location ?? "");
  const [notes, setNotes] = useState(student.notes ?? "");
  const [leaderId, setLeaderId] = useState(student.leader_id ?? "");
  const [custom, setCustom] = useState<CustomValues>(() => ({ ...(student.custom_fields ?? {}) }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim()) {
      setError("First name is required.");
      return;
    }
    setBusy(true);
    setError("");
    const err = await patchStudent(student.id, {
      first_name: firstName.trim(),
      last_name: lastName.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      location: location.trim() || null,
      notes: notes.trim() || null,
      ...(leaders.length ? { leader_id: leaderId || null } : {}),
      ...(defs.length ? { custom_fields: custom } : {}),
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
      <label className="text-xs text-ink-2">
        First name
        <input className={`${inputCls} w-full mt-1`} value={firstName} required autoFocus
          onChange={(e) => setFirstName(e.target.value)} />
      </label>
      <label className="text-xs text-ink-2">
        Last name
        <input className={`${inputCls} w-full mt-1`} value={lastName}
          onChange={(e) => setLastName(e.target.value)} />
      </label>
      <label className="text-xs text-ink-2">
        {term} email
        <input className={`${inputCls} w-full mt-1`} type="email" value={email}
          onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="text-xs text-ink-2">
        Phone
        <input className={`${inputCls} w-full mt-1`} value={phone}
          onChange={(e) => setPhone(e.target.value)} />
      </label>
      <label className="text-xs text-ink-2">
        Location
        <input className={`${inputCls} w-full mt-1`} value={location}
          onChange={(e) => setLocation(e.target.value)} />
      </label>
      {leaders.length > 0 && (
        <label className="text-xs text-ink-2">
          {volunteerTerm}
          <select className={`${inputCls} w-full mt-1`} value={leaderId}
            onChange={(e) => setLeaderId(e.target.value)}>
            <option value="">— none —</option>
            {leaders.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </label>
      )}
      <CustomFields defs={defs} values={custom} onChange={setCustom} />
      <label className="col-span-2 text-xs text-ink-2">
        Notes
        <textarea className={`${inputCls} w-full mt-1 leading-relaxed`} rows={3} value={notes}
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
