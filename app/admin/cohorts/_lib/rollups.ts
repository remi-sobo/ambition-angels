// Dosage rollups (modules/02-program.md "Attendance & dosage"): rates are
// (present + late) / (present + late + absent) over held sessions — excused
// and unmarked days don't count against anyone. "Regular attendee" follows
// the 21st-CCLC-style configurable threshold; 80% is the convention that
// gates stipends/certificates.

export const REGULAR_ATTENDEE_THRESHOLD = 0.8;

export type SessionLite = {
  id: string;
  session_date: string;
  status: string;
};

export type MarkLite = {
  session_id: string;
  student_id: string;
  status: string;
};

export type Dosage = {
  attended: number;
  absent: number;
  /** null until the student has any countable marks */
  rate: number | null;
  /** trailing run of unexcused absences across held sessions */
  consecutiveAbsences: number;
};

/** Roll up one student's marks across a cohort's held sessions (any order). */
export function dosageFor(
  studentId: string,
  sessions: SessionLite[],
  marks: MarkLite[]
): Dosage {
  const bySession = new Map<string, string>();
  for (const m of marks) {
    if (m.student_id === studentId) bySession.set(m.session_id, m.status);
  }
  const held = sessions
    .filter((s) => s.status === "held")
    .sort((a, b) => a.session_date.localeCompare(b.session_date));

  let attended = 0;
  let absent = 0;
  let run = 0;
  for (const s of held) {
    const status = bySession.get(s.id);
    if (status === "present" || status === "late") {
      attended++;
      run = 0;
    } else if (status === "absent") {
      absent++;
      run++;
    } else if (status === "excused") {
      run = 0;
    }
  }
  const counted = attended + absent;
  return {
    attended,
    absent,
    rate: counted > 0 ? attended / counted : null,
    consecutiveAbsences: run,
  };
}

export function pct(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}
