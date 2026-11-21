/**
 * The cohort record's next step (V4 Stage E, Detail archetype: "Every
 * screen leads with what to do next"). PURE.
 *
 * First match wins:
 *  1. a past session still waiting for attendance → take it (late, says how late)
 *  2. a session today                               → take attendance
 *  3. nobody enrolled                               → add people
 *  4. a session coming up                           → its date
 *  5. nothing scheduled                             → schedule one
 */

export type SessionForStep = {
  id: string;
  session_date: string;
  status: string;
  title?: string | null;
  marked: number;
};

/** A session counts as waiting when its day has come, it was not canceled, and no one is marked. */
export function sessionWaiting(s: { session_date: string; status: string; marked?: number }, today: string): boolean {
  return s.status !== "canceled" && s.session_date < today && (s.marked ?? 0) === 0 && s.status !== "held";
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86_400_000);
}

const fmt = (iso: string) =>
  new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });

export type CohortStep = {
  title: string | null;
  due?: { text: string; late?: boolean };
  meta?: string;
  action: "attendance" | "people" | "schedule" | null;
  /** The session the primary "Take attendance" opens. */
  sessionId: string | null;
  nextDate: string | null;
};

export function cohortNextStep({
  enrolled,
  sessions,
  today,
}: {
  enrolled: number;
  sessions: SessionForStep[];
  today: string;
}): CohortStep {
  const live = sessions.filter((s) => s.status !== "canceled").sort((a, b) => a.session_date.localeCompare(b.session_date));
  const waiting = live.filter((s) => sessionWaiting(s, today));
  const todays = live.find((s) => s.session_date === today) ?? null;
  const upcoming = live.find((s) => s.session_date > today && s.status === "scheduled") ?? null;
  const nextDate = todays?.session_date ?? upcoming?.session_date ?? null;

  if (waiting.length > 0 && enrolled > 0) {
    const oldest = waiting[0];
    const late = daysBetween(oldest.session_date, today);
    return {
      title: `Take attendance for ${fmt(oldest.session_date)}.`,
      due: { text: `${late} day${late === 1 ? "" : "s"} late.`, late: true },
      meta:
        waiting.length > 1
          ? `${waiting.length} past sessions have no attendance yet. Oldest first.`
          : "Nobody has been marked for this session yet.",
      action: "attendance",
      sessionId: oldest.id,
      nextDate,
    };
  }
  if (todays && enrolled > 0) {
    return {
      title: todays.marked > 0 ? "Finish today's attendance." : "Take attendance today.",
      due: { text: "Today." },
      meta: `${todays.title ? `${todays.title}. ` : ""}${todays.marked} of ${enrolled} marked so far.`,
      action: "attendance",
      sessionId: todays.id,
      nextDate,
    };
  }
  if (enrolled === 0) {
    return {
      title: "Add people to this cohort.",
      meta: "Select people on the roster and choose Enroll in cohort, or import a roster file.",
      action: "people",
      sessionId: null,
      nextDate,
    };
  }
  if (upcoming) {
    const days = daysBetween(today, upcoming.session_date);
    return {
      title: `Next session ${fmt(upcoming.session_date)}.`,
      due: { text: days === 1 ? "Tomorrow." : `In ${days} days.` },
      meta: "The roster is ready. Take attendance from your phone on the day.",
      action: null,
      sessionId: upcoming.id,
      nextDate,
    };
  }
  return { title: "Schedule the next session.", action: "schedule", sessionId: null, nextDate: null };
}
