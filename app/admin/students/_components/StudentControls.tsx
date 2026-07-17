"use client";

// Client pieces of the student roster: rows with stage advance, guardian
// contact, inline edit; and the new-student form.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { JOURNEY_STAGES, STAGE_ORDER, STAGE_LABELS } from "../_lib/stages";
import CustomFields, { type CustomValues } from "./CustomFields";
import type { CustomFieldDef } from "@/lib/admin/customFields";

// Per-org stage vocabulary (participant_stages, program spine spec #4),
// passed down from the server page. The static constants above remain only
// as the default when no stages are provided.
export type StageOption = { stage_key: string; label: string; terminal: boolean };

const FALLBACK_STAGES: StageOption[] = STAGE_ORDER.map((s) => ({
  stage_key: s,
  label: STAGE_LABELS[s],
  terminal: !JOURNEY_STAGES.includes(s as (typeof JOURNEY_STAGES)[number]),
}));

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
  custom_fields: Record<string, unknown> | null;
};


const SOURCE_LABELS: Record<string, string> = {
  ygb: "YGB Camp",
  career_quiz: "Career Quiz",
};

const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";

export function fullName(s: Pick<Student, "first_name" | "last_name">) {
  return [s.first_name, s.last_name].filter(Boolean).join(" ");
}

export function StudentRow({
  student,
  stages = FALLBACK_STAGES,
  customFieldDefs = [],
}: {
  student: Student;
  stages?: StageOption[];
  /** Per-org custom field defs (empty for AA — renders nothing). */
  customFieldDefs?: CustomFieldDef[];
}) {
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
  // "Advance" walks the org's non-terminal journey in order.
  const journey = stages.filter((s) => !s.terminal);
  const stageIdx = journey.findIndex((s) => s.stage_key === student.stage);
  const next = stageIdx >= 0 && stageIdx < journey.length - 1 ? journey[stageIdx + 1] : null;
  const labelOf = (key: string) => stages.find((s) => s.stage_key === key)?.label ?? key;

  return (
    <article
      className={`bg-surface border-[1.5px] border-outline rounded-xl p-3 text-sm ${busy ? "opacity-60" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-ink-1">{fullName(student)}</span>
        {student.grade && <span className="text-[11px] text-ink-2">Grade {student.grade}</span>}
        {student.school && <span className="text-[11px] text-ink-2">· {student.school}</span>}
        {student.external_source && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-tile text-ink-2 uppercase tracking-wider">
            {SOURCE_LABELS[student.external_source] ?? student.external_source}
          </span>
        )}
        <span className="ml-auto text-[11px] tabular-nums text-ink-2">
          {student.last_activity_at ? `active ${student.last_activity_at}` : "no activity"}
        </span>
      </div>

      {(student.guardian_name || contactEmail) && (
        <p className="text-[12px] text-ink-2 mt-1">
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
          className="text-[11px] bg-tile border-[1.5px] border-outline rounded-md px-2 py-1 text-ink-1 cursor-pointer"
        >
          {stages.map((s) => (
            <option key={s.stage_key} value={s.stage_key} className="bg-surface">{s.label}</option>
          ))}
          {!stages.some((s) => s.stage_key === student.stage) && (
            <option value={student.stage} className="bg-surface">{labelOf(student.stage)}</option>
          )}
        </select>
        {next && (
          <button
            onClick={() => patch({ stage: next.stage_key, touch: true })}
            disabled={busy}
            className="px-2 py-1 rounded-md text-[11px] font-semibold bg-orange/15 text-orange hover:bg-orange/25"
          >
            Advance → {next.label}
          </button>
        )}
        <button
          onClick={() => patch({ touch: true })}
          disabled={busy}
          className="px-2 py-1 rounded-md text-[11px] bg-tile hover:bg-[#EFE6D4] text-ink-2"
        >
          Log activity
        </button>
        <button
          onClick={() => setEditing((v) => !v)}
          className="px-2 py-1 rounded-md text-[11px] bg-tile hover:bg-[#EFE6D4] text-ink-2"
        >
          Edit
        </button>
        <button
          onClick={() => void remove()}
          disabled={busy}
          className="ml-auto px-2 py-1 rounded-md text-[11px] text-ink-2 hover:text-expense"
        >
          Delete
        </button>
      </div>

      {editing && (
        <InlineEdit student={student} patch={patch} defs={customFieldDefs} onDone={() => setEditing(false)} />
      )}
    </article>
  );
}

function InlineEdit({
  student,
  patch,
  defs,
  onDone,
}: {
  student: Student;
  patch: (fields: Record<string, unknown>) => Promise<void>;
  defs: CustomFieldDef[];
  onDone: () => void;
}) {
  const [grade, setGrade] = useState(student.grade ?? "");
  const [school, setSchool] = useState(student.school ?? "");
  const [email, setEmail] = useState(student.email ?? "");
  const [guardianName, setGuardianName] = useState(student.guardian_name ?? "");
  const [guardianEmail, setGuardianEmail] = useState(student.guardian_email ?? "");
  const [guardianPhone, setGuardianPhone] = useState(student.guardian_phone ?? "");
  const [custom, setCustom] = useState<CustomValues>(student.custom_fields ?? {});

  const save = async () => {
    await patch({
      grade: grade || null,
      school: school || null,
      email: email || null,
      guardian_name: guardianName || null,
      guardian_email: guardianEmail || null,
      guardian_phone: guardianPhone || null,
      // Only send custom_fields when the org actually has fields — keeps AA's
      // request identical to before.
      ...(defs.length ? { custom_fields: custom } : {}),
    });
    onDone();
  };

  return (
    <div className="mt-3 pt-3 border-t border-outline grid grid-cols-2 lg:grid-cols-6 gap-2 items-end">
      <label className="text-[10px] text-ink-2">
        Grade
        <input className={`${inputCls} block w-full mt-0.5 !py-1 !text-xs`} value={grade}
          onChange={(e) => setGrade(e.target.value)} />
      </label>
      <label className="text-[10px] text-ink-2">
        School
        <input className={`${inputCls} block w-full mt-0.5 !py-1 !text-xs`} value={school}
          onChange={(e) => setSchool(e.target.value)} />
      </label>
      <label className="text-[10px] text-ink-2">
        Student email
        <input className={`${inputCls} block w-full mt-0.5 !py-1 !text-xs`} value={email}
          onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="text-[10px] text-ink-2">
        Guardian
        <input className={`${inputCls} block w-full mt-0.5 !py-1 !text-xs`} value={guardianName}
          onChange={(e) => setGuardianName(e.target.value)} />
      </label>
      <label className="text-[10px] text-ink-2">
        Guardian email
        <input className={`${inputCls} block w-full mt-0.5 !py-1 !text-xs`} value={guardianEmail}
          onChange={(e) => setGuardianEmail(e.target.value)} />
      </label>
      <label className="text-[10px] text-ink-2">
        Guardian phone
        <input className={`${inputCls} block w-full mt-0.5 !py-1 !text-xs`} value={guardianPhone}
          onChange={(e) => setGuardianPhone(e.target.value)} />
      </label>
      <CustomFields defs={defs} values={custom} onChange={setCustom} compact />
      <div className="col-span-full flex justify-end gap-2">
        <button onClick={onDone} className="text-[11px] text-ink-2 hover:text-ink-1 px-2 py-1">
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

export function NewStudentForm({ customFieldDefs = [] }: { customFieldDefs?: CustomFieldDef[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [grade, setGrade] = useState("");
  const [stage, setStage] = useState("discover");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [custom, setCustom] = useState<CustomValues>({});

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
          ...(customFieldDefs.length ? { custom_fields: custom } : {}),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? `HTTP ${res.status}`);
        return;
      }
      setFirstName(""); setLastName(""); setGrade(""); setGuardianEmail(""); setCustom({});
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
      className="w-full bg-surface shadow-panel border-[1.5px] border-outline rounded-card p-4 grid grid-cols-2 lg:grid-cols-6 gap-3 items-end">
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
        Grade
        <input className={`${inputCls} w-full mt-1`} value={grade} placeholder="8"
          onChange={(e) => setGrade(e.target.value)} />
      </label>
      <label className="text-xs text-ink-2">
        Stage
        <select className={`${inputCls} w-full mt-1`} value={stage} onChange={(e) => setStage(e.target.value)}>
          {STAGE_ORDER.map((s) => (
            <option key={s} value={s} className="bg-surface">{STAGE_LABELS[s]}</option>
          ))}
        </select>
      </label>
      <label className="text-xs text-ink-2">
        Guardian email
        <input className={`${inputCls} w-full mt-1`} type="email" value={guardianEmail}
          onChange={(e) => setGuardianEmail(e.target.value)} />
      </label>
      <CustomFields defs={customFieldDefs} values={custom} onChange={setCustom} />
      <div className="flex gap-2">
        <button type="submit" disabled={busy}
          className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50">
          {busy ? "Saving…" : "Add"}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="text-xs text-ink-2 hover:text-ink-1 px-2">
          Cancel
        </button>
      </div>
    </form>
  );
}
