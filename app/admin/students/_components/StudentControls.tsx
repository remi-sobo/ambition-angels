"use client";

// Client pieces of the student roster: rows with stage advance, guardian
// contact, inline edit; and the new-student form.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { JOURNEY_STAGES, STAGE_ORDER, STAGE_LABELS } from "../_lib/stages";

export type Student = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  dob: string | null;
  grade: string | null;
  school: string | null;
  location: string | null;
  stage: string;
  guardian_name: string | null;
  guardian_email: string | null;
  guardian_phone: string | null;
  notes: string | null;
  last_activity_at: string | null;
  external_source: string | null;
};


const SOURCE_LABELS: Record<string, string> = {
  ygb: "YGB Camp",
  career_quiz: "Career Quiz",
};

const inputCls =
  "bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-cream text-sm placeholder-gray-mid focus:outline-none focus:border-orange/40";

export function fullName(s: Pick<Student, "first_name" | "last_name">) {
  return [s.first_name, s.last_name].filter(Boolean).join(" ");
}

export function StudentRow({ student }: { student: Student }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const patch = async (fields: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/students/${student.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete ${fullName(student)}?`)) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/students/${student.id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const contactEmail = student.email ?? student.guardian_email;
  const stageIdx = JOURNEY_STAGES.indexOf(student.stage as (typeof JOURNEY_STAGES)[number]);
  const next = stageIdx >= 0 && stageIdx < JOURNEY_STAGES.length - 1
    ? JOURNEY_STAGES[stageIdx + 1]
    : null;

  return (
    <article
      className={`bg-[#1d1812] border border-white/10 rounded-xl p-3 text-sm ${busy ? "opacity-60" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-cream">{fullName(student)}</span>
        {student.grade && <span className="text-[11px] text-gray-mid">Grade {student.grade}</span>}
        {student.school && <span className="text-[11px] text-gray-mid">· {student.school}</span>}
        {student.external_source && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/10 text-gray-mid uppercase tracking-wider">
            {SOURCE_LABELS[student.external_source] ?? student.external_source}
          </span>
        )}
        <span className="ml-auto text-[11px] tabular-nums text-gray-mid">
          {student.last_activity_at ? `active ${student.last_activity_at}` : "no activity"}
        </span>
      </div>

      {(student.guardian_name || contactEmail) && (
        <p className="text-[12px] text-gray-mid mt-1">
          {student.guardian_name ? `Guardian: ${student.guardian_name}` : "Contact:"}
          {contactEmail && (
            <a href={`mailto:${contactEmail}`} className="text-orange/80 hover:text-orange ml-1.5">
              {contactEmail}
            </a>
          )}
          {student.guardian_phone ? ` · ${student.guardian_phone}` : ""}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1 mt-2">
        <select
          value={student.stage}
          disabled={busy}
          onChange={(e) => patch({ stage: e.target.value })}
          className="text-[11px] bg-white/5 border border-white/10 rounded-md px-2 py-1 text-cream/80 cursor-pointer"
        >
          {STAGE_ORDER.map((s) => (
            <option key={s} value={s} className="bg-[#1d1812]">{STAGE_LABELS[s]}</option>
          ))}
        </select>
        {next && (
          <button
            onClick={() => patch({ stage: next, touch: true })}
            disabled={busy}
            className="px-2 py-1 rounded-md text-[11px] font-semibold bg-orange/15 text-orange hover:bg-orange/25"
          >
            Advance → {STAGE_LABELS[next]}
          </button>
        )}
        <button
          onClick={() => patch({ touch: true })}
          disabled={busy}
          className="px-2 py-1 rounded-md text-[11px] bg-white/5 hover:bg-white/10 text-cream/70"
        >
          Log activity
        </button>
        <button
          onClick={() => setEditing((v) => !v)}
          className="px-2 py-1 rounded-md text-[11px] bg-white/5 hover:bg-white/10 text-cream/70"
        >
          Edit
        </button>
        <button
          onClick={() => void remove()}
          disabled={busy}
          className="ml-auto px-2 py-1 rounded-md text-[11px] text-gray-mid hover:text-red-300"
        >
          Delete
        </button>
      </div>

      {editing && <InlineEdit student={student} patch={patch} onDone={() => setEditing(false)} />}
    </article>
  );
}

function InlineEdit({
  student,
  patch,
  onDone,
}: {
  student: Student;
  patch: (fields: Record<string, unknown>) => Promise<void>;
  onDone: () => void;
}) {
  const [grade, setGrade] = useState(student.grade ?? "");
  const [school, setSchool] = useState(student.school ?? "");
  const [email, setEmail] = useState(student.email ?? "");
  const [guardianName, setGuardianName] = useState(student.guardian_name ?? "");
  const [guardianEmail, setGuardianEmail] = useState(student.guardian_email ?? "");
  const [guardianPhone, setGuardianPhone] = useState(student.guardian_phone ?? "");

  const save = async () => {
    await patch({
      grade: grade || null,
      school: school || null,
      email: email || null,
      guardian_name: guardianName || null,
      guardian_email: guardianEmail || null,
      guardian_phone: guardianPhone || null,
    });
    onDone();
  };

  return (
    <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-2 lg:grid-cols-6 gap-2 items-end">
      <label className="text-[10px] text-gray-mid">
        Grade
        <input className={`${inputCls} block w-full mt-0.5 !py-1 !text-xs`} value={grade}
          onChange={(e) => setGrade(e.target.value)} />
      </label>
      <label className="text-[10px] text-gray-mid">
        School
        <input className={`${inputCls} block w-full mt-0.5 !py-1 !text-xs`} value={school}
          onChange={(e) => setSchool(e.target.value)} />
      </label>
      <label className="text-[10px] text-gray-mid">
        Student email
        <input className={`${inputCls} block w-full mt-0.5 !py-1 !text-xs`} value={email}
          onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="text-[10px] text-gray-mid">
        Guardian
        <input className={`${inputCls} block w-full mt-0.5 !py-1 !text-xs`} value={guardianName}
          onChange={(e) => setGuardianName(e.target.value)} />
      </label>
      <label className="text-[10px] text-gray-mid">
        Guardian email
        <input className={`${inputCls} block w-full mt-0.5 !py-1 !text-xs`} value={guardianEmail}
          onChange={(e) => setGuardianEmail(e.target.value)} />
      </label>
      <label className="text-[10px] text-gray-mid">
        Guardian phone
        <input className={`${inputCls} block w-full mt-0.5 !py-1 !text-xs`} value={guardianPhone}
          onChange={(e) => setGuardianPhone(e.target.value)} />
      </label>
      <div className="col-span-full flex justify-end gap-2">
        <button onClick={onDone} className="text-[11px] text-gray-mid hover:text-cream px-2 py-1">
          Cancel
        </button>
        <button onClick={() => void save()}
          className="text-[11px] font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1 rounded-full">
          Save
        </button>
      </div>
    </div>
  );
}

export function NewStudentForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [grade, setGrade] = useState("");
  const [stage, setStage] = useState("discover");
  const [guardianEmail, setGuardianEmail] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/admin/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName || undefined,
          grade: grade || undefined,
          stage,
          guardian_email: guardianEmail || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? `HTTP ${res.status}`);
      }
      setFirstName(""); setLastName(""); setGrade(""); setGuardianEmail("");
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors">
        + Add student
      </button>
    );
  }

  return (
    <form onSubmit={submit}
      className="w-full bg-white/[0.03] border border-white/10 rounded-card p-4 grid grid-cols-2 lg:grid-cols-6 gap-3 items-end">
      <label className="text-xs text-gray-mid">
        First name
        <input className={`${inputCls} w-full mt-1`} value={firstName} required autoFocus
          onChange={(e) => setFirstName(e.target.value)} />
      </label>
      <label className="text-xs text-gray-mid">
        Last name
        <input className={`${inputCls} w-full mt-1`} value={lastName}
          onChange={(e) => setLastName(e.target.value)} />
      </label>
      <label className="text-xs text-gray-mid">
        Grade
        <input className={`${inputCls} w-full mt-1`} value={grade} placeholder="8"
          onChange={(e) => setGrade(e.target.value)} />
      </label>
      <label className="text-xs text-gray-mid">
        Stage
        <select className={`${inputCls} w-full mt-1`} value={stage} onChange={(e) => setStage(e.target.value)}>
          {STAGE_ORDER.map((s) => (
            <option key={s} value={s} className="bg-[#1d1812]">{STAGE_LABELS[s]}</option>
          ))}
        </select>
      </label>
      <label className="text-xs text-gray-mid">
        Guardian email
        <input className={`${inputCls} w-full mt-1`} type="email" value={guardianEmail}
          onChange={(e) => setGuardianEmail(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={busy}
          className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50">
          {busy ? "Saving…" : "Add"}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="text-xs text-gray-mid hover:text-cream px-2">
          Cancel
        </button>
      </div>
    </form>
  );
}
