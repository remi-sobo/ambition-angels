"use client";

// Phone attendance (V4 Stage E, spec §9 and §10; AttendancePhone.dc.html).
//
//  - Everyone counts as present. One tap per exception: Late, Absent or
//    Excused. Tapping the active one again goes back to Present.
//  - Each tap goes into the offline queue on this device (pending marks
//    only: session, participant, status, time; never the roster) and is sent
//    right away when online. Save counts everyone not tapped as present.
//  - Offline, the screen says so, says how many marks are waiting, and says
//    plainly that closing the page keeps them on this device until it is
//    back online. The shell's <AttendanceSync> sends them then.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/admin/_components/feedback/ToastProvider";
import { buttonClass } from "@/app/admin/_components/ui/Button";
import {
  MARK_LABELS,
  MARK_STATUSES,
  attendanceCounts,
  effectiveStatus,
  marksToSave,
  nextStatusForTap,
  type MarkStatus,
} from "@/lib/admin/program/attendance";
import { onQueueChange, queueMarks, syncNow, waitingCount } from "@/lib/admin/program/attendanceSync";

export type PhoneRosterEntry = {
  participantId: string;
  name: string;
  detail: string | null;
  saved: MarkStatus | null;
};

const ON: Record<MarkStatus, string> = {
  present: "bg-revenue-bg border-revenue text-revenue font-bold",
  late: "bg-status-watch-bg border-status-watch-text text-status-watch-text font-bold",
  absent: "bg-expense-bg border-expense text-expense font-bold",
  excused: "bg-tile border-ink-2 text-ink-1 font-bold",
};
const ASSUMED = "bg-surface border-dashed border-revenue text-revenue font-semibold";
const OFF = "bg-transparent border-hairline text-ink-2 font-medium";

function clock(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(" ", "").toLowerCase();
}

export default function PhoneAttendance({
  sessionId,
  roster: initial,
  canWrite,
}: {
  sessionId: string;
  roster: PhoneRosterEntry[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saved, setSaved] = useState<Record<string, MarkStatus | null>>(() =>
    Object.fromEntries(initial.map((r) => [r.participantId, r.saved])),
  );
  const [local, setLocal] = useState<Record<string, MarkStatus | undefined>>({});
  const [online, setOnline] = useState(true);
  const [waiting, setWaiting] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastQueued, setLastQueued] = useState<Date | null>(null);
  const [finished, setFinished] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localRef = useRef(local);
  localRef.current = local;

  const refreshCount = useCallback(async () => setWaiting(await waitingCount(sessionId)), [sessionId]);

  const sync = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    setSyncing(true);
    const r = await syncNow();
    setSyncing(false);
    const left = await waitingCount(sessionId);
    setWaiting(left);
    if (r.rejected > 0) toast.error(`${r.rejected} mark${r.rejected === 1 ? "" : "s"} could not be saved. Reload the page and check the roster.`);
    if (left === 0 && r.kept === 0) {
      // Everything this phone tapped is on the server now.
      const taps = localRef.current;
      const done: Record<string, MarkStatus> = {};
      for (const [k, v] of Object.entries(taps)) if (v) done[k] = v;
      setSaved((s) => ({ ...s, ...done }));
      setLocal({});
    }
  }, [sessionId, toast]);

  useEffect(() => {
    setOnline(navigator.onLine);
    void refreshCount();
    const up = () => {
      setOnline(true);
      void sync();
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    const off = onQueueChange(() => void refreshCount());
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      off();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [refreshCount, sync]);

  // Closing the page while marks wait offline: the browser asks first, and
  // the banner below already says the marks stay on this device.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (waiting > 0 && !navigator.onLine) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [waiting]);

  const entries = useMemo(
    () => initial.map((r) => ({ participantId: r.participantId, saved: saved[r.participantId] ?? null })),
    [initial, saved],
  );
  const counts = attendanceCounts(entries, local);

  const scheduleSync = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void sync(), 500);
  };

  const tap = async (participantId: string, status: MarkStatus) => {
    if (!canWrite) return;
    const current = effectiveStatus(saved[participantId], local[participantId]).status;
    const next = nextStatusForTap(current, status);
    setLocal((l) => ({ ...l, [participantId]: next }));
    setFinished(false);
    await queueMarks([{ sessionId, participantId, status: next }]);
    setLastQueued(new Date());
    scheduleSync();
  };

  const save = async () => {
    const marks = marksToSave(entries, local);
    if (marks.length > 0) {
      setLocal((l) => ({ ...l, ...Object.fromEntries(marks.map((m) => [m.participantId, m.status])) }));
      localRef.current = { ...localRef.current, ...Object.fromEntries(marks.map((m) => [m.participantId, m.status])) };
      await queueMarks(marks.map((m) => ({ sessionId, participantId: m.participantId, status: m.status })));
      setLastQueued(new Date());
    }
    setFinished(true);
    if (navigator.onLine) {
      await sync();
      if ((await waitingCount(sessionId)) === 0) {
        toast.success("Attendance saved.");
        router.refresh();
      }
    } else {
      await refreshCount();
    }
  };

  const status = !online
    ? {
        tone: "warn" as const,
        title: waiting > 0 ? "You are offline. Marks are saved on this device." : "You are offline.",
        line:
          waiting > 0
            ? `${waiting} mark${waiting === 1 ? "" : "s"} waiting${lastQueued ? `, last saved here ${clock(lastQueued)}` : ""}. They send when you are back online. If you close this page, they stay on this device until it is back online.`
            : "Keep marking. Your marks stay on this device until it is back online.",
      }
    : waiting > 0
      ? { tone: "busy" as const, title: syncing ? "Sending…" : "Not sent yet", line: `${waiting} mark${waiting === 1 ? "" : "s"} waiting to send.` }
      : finished
        ? { tone: "ok" as const, title: "Attendance saved.", line: `${counts.here} here, ${counts.absent} absent${counts.excused ? `, ${counts.excused} excused` : ""}.` }
        : { tone: "ok" as const, title: "Online. Every tap saves.", line: counts.assumed > 0 ? `Tap Save to count the ${counts.assumed} not marked as present.` : "Everyone is marked." };

  return (
    <div className="pb-4">
      <div className="flex items-center gap-3 mb-3">
        <div
          role="progressbar"
          aria-label="Marked so far"
          aria-valuemin={0}
          aria-valuemax={counts.total}
          aria-valuenow={counts.marked}
          className="flex-1 h-1.5 rounded-full bg-tile overflow-hidden"
        >
          <div className="h-full bg-revenue" style={{ width: `${counts.total ? (counts.marked / counts.total) * 100 : 0}%` }} />
        </div>
        <span className="text-xs text-ink-2 tabular-nums whitespace-nowrap">
          {counts.marked} of {counts.total} marked
        </span>
      </div>

      <p className="text-sm text-ink-1 font-semibold">Everyone counts as present.</p>
      <p className="text-xs text-ink-2 mb-3">Tap only who is late, absent or excused. Tap it again to undo.</p>

      {initial.length === 0 ? (
        <p className="text-sm text-ink-2 py-6">No one is enrolled in this cohort yet. Add people from the cohort page.</p>
      ) : (
        <ul aria-label="Roster" className="bg-surface border border-hairline rounded-panel divide-y divide-hairline">
          {initial.map((r) => {
            const e = effectiveStatus(saved[r.participantId], local[r.participantId]);
            return (
              <li key={r.participantId} className="flex items-center gap-2 min-h-[60px] py-2 pl-3 pr-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold text-ink-1 leading-snug line-clamp-2 break-words">{r.name}</div>
                  <div className="text-xs text-ink-2 truncate">
                    {e.assumed ? "Present unless you tap" : MARK_LABELS[e.status]}
                    {r.detail ? ` · ${r.detail}` : ""}
                  </div>
                </div>
                <div role="radiogroup" aria-label={`Attendance for ${r.name}`} className="flex gap-1 shrink-0">
                  {MARK_STATUSES.map((s) => {
                    const on = e.status === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        disabled={!canWrite}
                        onClick={() => void tap(r.participantId, s)}
                        className={`w-[52px] sm:w-[68px] h-11 rounded-control border text-[11px] sm:text-xs transition-colors disabled:opacity-60 ${
                          on ? (e.assumed ? ASSUMED : ON[s]) : OFF
                        }`}
                      >
                        {MARK_LABELS[s]}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="sticky bottom-[calc(53px+env(safe-area-inset-bottom))] lg:bottom-0 mt-4 -mx-4 px-4 py-3 bg-app/95 backdrop-blur border-t border-hairline flex items-center gap-3">
        <div role="status" aria-live="polite" className="min-w-0 flex-1">
          <div
            className={`text-sm font-semibold ${
              status.tone === "warn" ? "text-status-watch-text" : status.tone === "busy" ? "text-ink-1" : "text-revenue"
            }`}
          >
            {status.title}
          </div>
          <div className="text-xs text-ink-2">{status.line}</div>
        </div>
        {canWrite && initial.length > 0 ? (
          <button type="button" onClick={() => void save()} className={buttonClass({ variant: "primary", size: "md" }) + " shrink-0 min-h-[44px]"}>
            Save
          </button>
        ) : null}
      </div>
    </div>
  );
}
