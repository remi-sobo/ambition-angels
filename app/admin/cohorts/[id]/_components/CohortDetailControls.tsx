"use client";

// Client pieces of the cohort detail page: status/delete header controls,
// member rows (status, remove), add-member picker, session rows, and the
// new-session form. Rollups are computed server-side and passed as props.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { COHORT_STATUSES, COHORT_STATUS_LABELS } from "../../_lib/constants";

const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";

const MEMBER_STATUSES = ["enrolled", "completed", "dropped"] as const;
const MEMBER_STATUS_LABELS: Record<string, string> = {
  enrolled: "Enrolled",
  completed: "Completed",
  dropped: "Dropped",
};

function useApi() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const call = async (url: string, method: string, body?: unknown) => {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
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
  return { busy, call };
}

export function CohortHeaderControls({
  cohortId,
  status,
  name,
  acceptingApplications,
}: {
  cohortId: string;
  status: string;
  name: string;
  acceptingApplications: boolean;
}) {
  const router = useRouter();
  const { busy, call } = useApi();

  const remove = async () => {
    if (!confirm(`Delete cohort "${name}"? Sessions and attendance go with it.`)) return;
    const res = await fetch(`/api/admin/cohorts/${cohortId}`, { method: "DELETE" });
    if (res.ok) router.push("/admin/cohorts");
    else {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? `HTTP ${res.status}`);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() =>
          call(`/api/admin/cohorts/${cohortId}`, "PATCH", {
            accepting_applications: !acceptingApplications,
          })
        }
        disabled={busy}
        title="Shows this cohort on the public /apply form"
        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
          acceptingApplications
            ? "bg-revenue-bg text-revenue hover:bg-revenue-bg"
            : "bg-tile text-ink-2 hover:bg-[#EFE6D4]"
        }`}
      >
        {acceptingApplications ? "Accepting applications" : "Applications closed"}
      </button>
      <select
        value={status}
        disabled={busy}
        onChange={(e) => call(`/api/admin/cohorts/${cohortId}`, "PATCH", { status: e.target.value })}
        className="text-[11px] bg-tile border-[1.5px] border-outline rounded-md px-2 py-1 text-ink-1 cursor-pointer"
      >
        {COHORT_STATUSES.map((s) => (
          <option key={s} value={s} className="bg-surface">{COHORT_STATUS_LABELS[s]}</option>
        ))}
      </select>
      <button
        onClick={() => void remove()}
        className="px-2 py-1 rounded-md text-[11px] text-ink-2 hover:text-expense"
      >
        Delete
      </button>
    </div>
  );
}

export type MemberView = {
  memberId: string;
  studentId: string;
  name: string;
  grade: string | null;
  status: string;
  attended: number;
  absent: number;
  rateText: string;
  consecutiveAbsences: number;
  regular: boolean;
};

export function MemberRow({ cohortId, member }: { cohortId: string; member: MemberView }) {
  const { busy, call } = useApi();
  const m = member;

  return (
    <article
      className={`bg-surface border-[1.5px] border-outline rounded-xl px-3 py-2.5 text-sm flex flex-wrap items-center gap-2 ${busy ? "opacity-60" : ""}`}
    >
      <span className="font-semibold text-ink-1">{m.name}</span>
      {m.grade && <span className="text-[11px] text-ink-2">Grade {m.grade}</span>}
      {m.regular && (
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-revenue-bg text-revenue uppercase tracking-wider">
          Regular
        </span>
      )}
      {m.consecutiveAbsences >= 2 && (
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-expense-bg text-expense uppercase tracking-wider">
          {m.consecutiveAbsences} absences in a row
        </span>
      )}
      <span className="ml-auto text-[11px] tabular-nums text-ink-2">
        {m.rateText}{m.attended + m.absent > 0 ? ` · ${m.attended}/${m.attended + m.absent} sessions` : ""}
      </span>
      <select
        value={m.status}
        disabled={busy}
        onChange={(e) =>
          call(`/api/admin/cohorts/${cohortId}/members`, "PATCH", {
            student_id: m.studentId,
            status: e.target.value,
          })
        }
        className="text-[11px] bg-tile border-[1.5px] border-outline rounded-md px-2 py-1 text-ink-1 cursor-pointer"
      >
        {MEMBER_STATUSES.map((s) => (
          <option key={s} value={s} className="bg-surface">{MEMBER_STATUS_LABELS[s]}</option>
        ))}
      </select>
      <button
        onClick={() => {
          if (confirm(`Remove ${m.name} from this cohort?`))
            void call(`/api/admin/cohorts/${cohortId}/members`, "DELETE", { student_id: m.studentId });
        }}
        disabled={busy}
        className="px-2 py-1 rounded-md text-[11px] text-ink-2 hover:text-expense"
      >
        Remove
      </button>
    </article>
  );
}

export function AddMemberForm({
  cohortId,
  candidates,
}: {
  cohortId: string;
  candidates: { id: string; label: string }[];
}) {
  const { busy, call } = useApi();
  const [studentId, setStudentId] = useState("");

  if (candidates.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <select
        value={studentId}
        onChange={(e) => setStudentId(e.target.value)}
        className="text-[11px] bg-tile border-[1.5px] border-outline rounded-md px-2 py-1.5 text-ink-1 max-w-[220px]"
      >
        <option value="" className="bg-surface">Add student…</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id} className="bg-surface">{c.label}</option>
        ))}
      </select>
      <button
        onClick={() => {
          if (!studentId) return;
          void call(`/api/admin/cohorts/${cohortId}/members`, "POST", { student_id: studentId });
          setStudentId("");
        }}
        disabled={busy || !studentId}
        className="text-[11px] font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
      >
        Enroll
      </button>
    </div>
  );
}

export type SessionView = {
  id: string;
  session_date: string;
  title: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  attended: number;
  marked: number;
};

const SESSION_CHIP: Record<string, string> = {
  scheduled: "bg-tile text-ink-2",
  held: "bg-revenue-bg text-revenue",
  canceled: "bg-expense-bg text-expense/70",
};

export function SessionRow({
  cohortId,
  session,
  enrolled,
}: {
  cohortId: string;
  session: SessionView;
  enrolled: number;
}) {
  const { busy, call } = useApi();
  const s = session;
  const time = s.starts_at ? `${s.starts_at.slice(0, 5)}–${s.ends_at?.slice(0, 5) ?? ""}` : null;

  return (
    <article
      className={`bg-surface border-[1.5px] border-outline rounded-xl px-3 py-2.5 text-sm flex flex-wrap items-center gap-2 ${busy ? "opacity-60" : ""}`}
    >
      <span className="font-semibold text-ink-1 tabular-nums">{s.session_date}</span>
      {s.title && <span className="text-ink-1">{s.title}</span>}
      {time && <span className="text-[11px] text-ink-2">{time}</span>}
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${SESSION_CHIP[s.status] ?? ""}`}>
        {s.status}
      </span>
      <span className="ml-auto text-[11px] tabular-nums text-ink-2">
        {s.marked > 0 ? `${s.attended}/${s.marked} present` : `${enrolled} enrolled`}
      </span>
      {s.status !== "canceled" && (
        <Link
          href={`/admin/cohorts/${cohortId}/sessions/${s.id}`}
          className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-orange/15 text-orange hover:bg-orange/25"
        >
          {s.marked > 0 ? "Attendance" : "Take attendance"}
        </Link>
      )}
      {s.status === "scheduled" && (
        <button
          onClick={() => call(`/api/admin/sessions/${s.id}`, "PATCH", { status: "canceled" })}
          disabled={busy}
          className="px-2 py-1 rounded-md text-[11px] bg-tile hover:bg-[#EFE6D4] text-ink-2"
        >
          Cancel
        </button>
      )}
      <button
        onClick={() => {
          if (confirm(`Delete session on ${s.session_date}? Its attendance goes with it.`))
            void call(`/api/admin/sessions/${s.id}`, "DELETE");
        }}
        disabled={busy}
        className="px-2 py-1 rounded-md text-[11px] text-ink-2 hover:text-expense"
      >
        Delete
      </button>
    </article>
  );
}

export function NewSessionForm({ cohortId }: { cohortId: string }) {
  const { busy, call } = useApi();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="text-[11px] font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1.5 rounded-full transition-colors">
        + Add session
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void call(`/api/admin/cohorts/${cohortId}/sessions`, "POST", {
          session_date: date,
          title: title || undefined,
          starts_at: startsAt || undefined,
          ends_at: endsAt || undefined,
        }).then(() => {
          setDate(""); setTitle(""); setStartsAt(""); setEndsAt("");
          setOpen(false);
        });
      }}
      className="w-full bg-surface shadow-panel border-[1.5px] border-outline rounded-card p-3 grid grid-cols-2 lg:grid-cols-5 gap-2 items-end"
    >
      <label className="text-[10px] text-ink-2">
        Date
        <input className={`${inputCls} block w-full mt-0.5 !py-1 !text-xs`} type="date"
          value={date} required onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="text-[10px] text-ink-2">
        Title
        <input className={`${inputCls} block w-full mt-0.5 !py-1 !text-xs`} value={title}
          placeholder="Workshop" onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="text-[10px] text-ink-2">
        Starts
        <input className={`${inputCls} block w-full mt-0.5 !py-1 !text-xs`} type="time"
          value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
      </label>
      <label className="text-[10px] text-ink-2">
        Ends
        <input className={`${inputCls} block w-full mt-0.5 !py-1 !text-xs`} type="time"
          value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={busy}
          className="text-[11px] font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1.5 rounded-full disabled:opacity-50">
          Add
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="text-[11px] text-ink-2 hover:text-ink-1 px-1">
          Cancel
        </button>
      </div>
    </form>
  );
}
