"use client";

// Roster-tap check-in (modules/02-program.md "Attendance & dosage"):
// mobile-first, one big row per student; tapping cycles
// unmarked → present → late → excused → absent → unmarked. Each tap is
// saved immediately (optimistic, reverted on failure) so a coordinator can
// take attendance one-handed at the door.

import { useState } from "react";

export type RosterEntry = {
  studentId: string;
  name: string;
  grade: string | null;
  status: string | null; // present | late | excused | absent | null
};

const CYCLE = ["present", "late", "excused", "absent", null] as const;

const MARK_STYLES: Record<string, { row: string; chip: string; label: string }> = {
  present: {
    row: "border-green-500/40 bg-green-500/[0.07]",
    chip: "bg-green-500/20 text-green-400",
    label: "Present",
  },
  late: {
    row: "border-yellow-500/40 bg-yellow-500/[0.07]",
    chip: "bg-yellow-500/20 text-yellow-400",
    label: "Late",
  },
  excused: {
    row: "border-blue-500/40 bg-blue-500/[0.07]",
    chip: "bg-blue-500/20 text-blue-400",
    label: "Excused",
  },
  absent: {
    row: "border-red-500/40 bg-red-500/[0.07]",
    chip: "bg-red-500/20 text-red-400",
    label: "Absent",
  },
};

export default function AttendanceSheet({
  sessionId,
  roster: initialRoster,
}: {
  sessionId: string;
  roster: RosterEntry[];
}) {
  const [roster, setRoster] = useState(initialRoster);
  const [busyAll, setBusyAll] = useState(false);

  const setStatus = (studentId: string, status: string | null) =>
    setRoster((r) => r.map((e) => (e.studentId === studentId ? { ...e, status } : e)));

  const record = async (studentId: string, status: string | null, prev: string | null) => {
    setStatus(studentId, status);
    const res = await fetch(`/api/admin/sessions/${sessionId}/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ student_id: studentId, status }),
    }).catch(() => null);
    if (!res?.ok) {
      setStatus(studentId, prev);
      const j = await res?.json().catch(() => ({}));
      alert(j?.error ?? "Save failed — check your connection.");
    }
  };

  const tap = (e: RosterEntry) => {
    const idx = CYCLE.indexOf(e.status as (typeof CYCLE)[number]);
    const next = CYCLE[(idx + 1) % CYCLE.length];
    void record(e.studentId, next, e.status);
  };

  const allPresent = async () => {
    setBusyAll(true);
    const prev = roster;
    setRoster((r) => r.map((e) => (e.status === null ? { ...e, status: "present" } : e)));
    const res = await fetch(`/api/admin/sessions/${sessionId}/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: "present" }),
    }).catch(() => null);
    if (!res?.ok) {
      setRoster(prev);
      alert("Save failed — check your connection.");
    }
    setBusyAll(false);
  };

  const counts = { present: 0, late: 0, excused: 0, absent: 0, unmarked: 0 };
  for (const e of roster) {
    if (e.status && e.status in counts) counts[e.status as keyof typeof counts]++;
    else counts.unmarked++;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-[12px] tabular-nums text-cream/70">
          <span className="text-green-400 font-semibold">{counts.present + counts.late}</span> here
          {" · "}
          <span className="text-red-400 font-semibold">{counts.absent}</span> absent
          {counts.excused > 0 && (
            <>
              {" · "}
              <span className="text-blue-400 font-semibold">{counts.excused}</span> excused
            </>
          )}
          {" · "}
          <span className="text-gray-mid">{counts.unmarked} unmarked</span>
        </span>
        {counts.unmarked > 0 && (
          <button
            onClick={() => void allPresent()}
            disabled={busyAll}
            className="ml-auto text-[11px] font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
          >
            Mark rest present
          </button>
        )}
      </div>

      <div className="space-y-2">
        {roster.map((e) => {
          const style = e.status ? MARK_STYLES[e.status] : null;
          return (
            <button
              key={e.studentId}
              onClick={() => tap(e)}
              className={`w-full flex items-center gap-3 rounded-xl border px-4 py-4 text-left transition-colors select-none active:scale-[0.99] ${
                style ? style.row : "border-white/10 bg-[#161926] hover:border-white/25"
              }`}
            >
              <span className="font-semibold text-cream text-base">{e.name}</span>
              {e.grade && <span className="text-[11px] text-gray-mid">Grade {e.grade}</span>}
              <span
                className={`ml-auto text-[11px] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                  style ? style.chip : "bg-white/5 text-gray-mid"
                }`}
              >
                {style ? style.label : "Tap to mark"}
              </span>
            </button>
          );
        })}
        {roster.length === 0 && (
          <p className="text-sm text-gray-mid">No enrolled students in this cohort yet.</p>
        )}
      </div>

      <p className="text-[11px] text-gray-mid mt-4">
        Tap a name to cycle present → late → excused → absent → unmarked. Every tap saves
        instantly.
      </p>
    </div>
  );
}
