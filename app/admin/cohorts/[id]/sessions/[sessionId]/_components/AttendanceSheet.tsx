"use client";

// Roster-tap check-in (modules/02-program.md "Attendance & dosage"):
// mobile-first, one big row per student; tapping cycles
// unmarked → present → late → excused → absent → unmarked. Each tap is
// saved immediately (optimistic, reverted on failure) so a coordinator can
// take attendance one-handed at the door.

import { useState } from "react";
import { useToast } from "@/app/admin/_components/feedback/ToastProvider";
import { userMessage, networkMessage } from "@/lib/admin/errors";

export type RosterEntry = {
  studentId: string;
  name: string;
  grade: string | null;
  status: string | null; // present | late | excused | absent | null
};

const CYCLE = ["present", "late", "excused", "absent", null] as const;

const MARK_STYLES: Record<string, { row: string; chip: string; label: string }> = {
  present: {
    row: "border-revenue/30 bg-revenue-bg",
    chip: "bg-revenue-bg text-revenue",
    label: "Present",
  },
  late: {
    row: "border-status-watch/40 bg-status-watch-bg",
    chip: "bg-status-watch-bg text-status-watch-text",
    label: "Late",
  },
  excused: {
    row: "border-hairline bg-tile",
    chip: "bg-tile text-ink-2",
    label: "Excused",
  },
  absent: {
    row: "border-expense/30 bg-expense-bg",
    chip: "bg-expense-bg text-expense",
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
  const toast = useToast();
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
      if (res) {
        const j = await res.json().catch(() => ({}));
        toast.error(userMessage(res, j));
      } else {
        toast.error(networkMessage());
      }
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
      toast.error(res ? userMessage(res, await res.json().catch(() => null)) : networkMessage());
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
        <span className="text-xs tabular-nums text-ink-2">
          <span className="text-revenue font-semibold">{counts.present + counts.late}</span> here
          {" · "}
          <span className="text-expense font-semibold">{counts.absent}</span> absent
          {counts.excused > 0 && (
            <>
              {" · "}
              <span className="text-ink-2 font-semibold">{counts.excused}</span> excused
            </>
          )}
          {" · "}
          <span className="text-ink-2">{counts.unmarked} unmarked</span>
        </span>
        {counts.unmarked > 0 && (
          <button
            onClick={() => void allPresent()}
            disabled={busyAll}
            className="ml-auto text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
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
              className={`w-full flex items-center gap-3 rounded-panel border px-4 py-4 text-left transition-colors select-none active:scale-[0.99] ${
                style ? style.row : "border-hairline bg-surface hover:border-hairline"
              }`}
            >
              <span className="font-semibold text-ink-1 text-base">{e.name}</span>
              {e.grade && <span className="text-xs text-ink-2">Grade {e.grade}</span>}
              <span
                className={`ml-auto text-xs font-semibold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                  style ? style.chip : "bg-tile text-ink-2"
                }`}
              >
                {style ? style.label : "Tap to mark"}
              </span>
            </button>
          );
        })}
        {roster.length === 0 && (
          <p className="text-sm text-ink-2">No enrolled students in this cohort yet.</p>
        )}
      </div>

      <p className="text-xs text-ink-2 mt-4">
        Tap a name to cycle present → late → excused → absent → unmarked. Every tap saves
        instantly.
      </p>
    </div>
  );
}
