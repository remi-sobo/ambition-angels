/**
 * Ambition Coach on the roster and attendance standard (V4 Stage E). PURE.
 *
 * A coach match is a cohort of two that meets four times. With the data that
 * already exists (coach_matches + coach_sessions: scheduled_on, done_at) it
 * gets the same three things every roster row has: an attendance figure that
 * says where it came from, a last-met date, and a next step.
 *
 *  - done      a session with done_at set (both people met)
 *  - missed    a session scheduled before today that is not done
 *  - rate      done / (done + missed); null until something is due (never 0%)
 *
 * coach_sessions has no attendance status (met / one side missed /
 * rescheduled); see the Stage E report for the proposed schema.
 */

export type CoachMatchLite = {
  id: string;
  status: string;
  intro_sent_at: string | null;
  plan_shared_at: string | null;
  coach_reaction: string | null;
};
export type CoachSessionLite = { n: number; scheduled_on: string | null; done_at: string | null };

export type CoachProgress = {
  done: number;
  missed: number;
  rate: number | null;
  lastMet: string | null;
  next: { text: string; tone: "late" | "due" | "none" };
};

const fmt = (iso: string) =>
  new Date(iso.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });

export function coachMatchProgress(m: CoachMatchLite, sessions: CoachSessionLite[], today: string): CoachProgress {
  const byN = [1, 2, 3, 4].map((n) => sessions.find((s) => s.n === n) ?? { n, scheduled_on: null, done_at: null });
  const done = byN.filter((s) => s.done_at).length;
  const missedList = byN.filter((s) => !s.done_at && s.scheduled_on && s.scheduled_on < today);
  const missed = missedList.length;
  const lastMet =
    byN
      .map((s) => s.done_at)
      .filter((d): d is string => !!d)
      .sort()
      .pop() ?? null;
  const rate = done + missed > 0 ? done / (done + missed) : null;
  const base = { done, missed, rate, lastMet: lastMet ? lastMet.slice(0, 10) : null };

  if (m.status === "done") return { ...base, next: { text: "Finished", tone: "none" } };
  if (m.status === "ended") return { ...base, next: { text: "Ended early", tone: "none" } };
  if (m.status === "proposed" || !m.intro_sent_at) return { ...base, next: { text: "Send the intro", tone: "due" } };
  if (missed > 0) {
    const s = missedList[0];
    return { ...base, next: { text: `Check in: session ${s.n} was set for ${fmt(s.scheduled_on!)}`, tone: "late" } };
  }
  const upcoming = byN.find((s) => !s.done_at && s.scheduled_on && s.scheduled_on >= today);
  if (upcoming) return { ...base, next: { text: `Session ${upcoming.n} on ${fmt(upcoming.scheduled_on!)}`, tone: "none" } };
  const unscheduled = byN.find((s) => !s.done_at);
  if (unscheduled) return { ...base, next: { text: `Get session ${unscheduled.n} on the calendar`, tone: "due" } };
  if (!m.plan_shared_at) return { ...base, next: { text: "Nudge for the Ambition Plan", tone: "due" } };
  if (!m.coach_reaction) return { ...base, next: { text: "Ask the coach to react to the plan", tone: "due" } };
  return { ...base, next: { text: "Mark the match finished", tone: "due" } };
}
