import type { Status } from "@/lib/admin/status";

/**
 * Spec Home, stage H2 — Organization Health's cause engine. PURE and
 * deterministic (open decision 3, resolved: composed in code — same input,
 * same sentence; Reed can narrate on top later). Each composer takes plain
 * values its loader gathered from a CANONICAL source and returns one of the
 * five house statuses plus a cause sentence that states WHY — never a bare
 * status dot. Missing data reads `neutral` with an honest line, never a
 * guessed judgment (the same rule the strategy glance pins).
 */

export type HealthVerdict = { status: Status; cause: string };

const mo = (n: number) => `${Math.round(n * 10) / 10} mo`;
const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Money — runway from the canonical finance snapshot; the anchor's age
 *  travels with the verdict (stale money data must not read as authority). */
export function composeMoney(input: {
  runwayMonths: number | null;
  cashOnHand: number;
  burn3mo: number;
  anchorStale: boolean;
  anchorDate: string | null;
}): HealthVerdict {
  const staleNote = input.anchorStale
    ? ` Cash anchor ${input.anchorDate ? `from ${input.anchorDate}` : "never set"} — treat as stale.`
    : "";
  if (input.runwayMonths == null) {
    return {
      status: "neutral",
      cause: `Runway can't be computed — no burn or no cash anchor.${staleNote}`,
    };
  }
  const base = `Runway ${mo(input.runwayMonths)}: ${usd(input.cashOnHand)} on hand at ${usd(input.burn3mo)}/mo burn.${staleNote}`;
  if (input.runwayMonths < 3) return { status: "critical", cause: base };
  if (input.runwayMonths < 6) return { status: "watch", cause: base };
  return { status: "healthy", cause: base };
}

/** Fundraising — forecast vs. goal from the canonical cockpit forecast. */
export function composeFundraising(input: {
  raised: number;
  forecast: number;
  goal: number;
  gap: number;
}): HealthVerdict {
  if (input.goal <= 0) {
    return { status: "neutral", cause: "No fundraising goal set for this fiscal year." };
  }
  const pct = Math.round((input.forecast / input.goal) * 100);
  const cause = `Forecast ${usd(input.forecast)} against a ${usd(input.goal)} goal (${pct}%) — ${usd(input.raised)} raised, ${usd(Math.max(0, input.gap))} to find.`;
  if (pct >= 90) return { status: "healthy", cause };
  if (pct >= 70) return { status: "due", cause };
  if (pct >= 50) return { status: "watch", cause };
  return { status: "critical", cause };
}

/** Programs — the house attendance formula (the A6 resolver), 0–100 or null. */
export function composePrograms(input: { attendancePct: number | null }): HealthVerdict {
  if (input.attendancePct == null) {
    return {
      status: "neutral",
      cause: "No attendance marked across active cohorts in the trailing 3 weeks.",
    };
  }
  const p = Math.round(input.attendancePct);
  const cause = `Attendance ${p}% across active cohorts (present + late over marked), trailing 3 weeks.`;
  if (p >= 80) return { status: "healthy", cause };
  if (p >= 60) return { status: "watch", cause };
  return { status: "critical", cause };
}

/** Team execution — weekly task throughput vs. what's slipping. */
export function composeTeam(input: { doneThisWeek: number; overdueOpen: number }): HealthVerdict {
  const cause = `${input.doneThisWeek} task${input.doneThisWeek === 1 ? "" : "s"} completed this week; ${input.overdueOpen} overdue.`;
  if (input.overdueOpen === 0) return { status: "healthy", cause };
  if (input.overdueOpen < 10) return { status: "watch", cause };
  return { status: "critical", cause };
}

/** Strategy — the glance's own deterministic status line IS the cause
 *  (Contract 1: one function per number; this row invents nothing). */
export function composeStrategy(input: {
  hasPlan: boolean;
  statusLine: string;
  worstHealth: string | null; // 'behind' | 'at_risk' | 'on_track' | 'done' | null
}): HealthVerdict {
  if (!input.hasPlan) {
    return { status: "neutral", cause: "No strategic plan set up yet." };
  }
  const status: Status =
    input.worstHealth === "behind"
      ? "critical"
      : input.worstHealth === "at_risk"
        ? "watch"
        : "healthy";
  return { status, cause: input.statusLine };
}

/** Governance — filings owed and board seated. */
export function composeGovernance(input: {
  boardMembers: number;
  overdueFilings: number;
  nextDue: { title: string; due: string } | null;
  todayISO: string;
}): HealthVerdict {
  const board = `${input.boardMembers} board member${input.boardMembers === 1 ? "" : "s"} seated`;
  if (input.overdueFilings > 0) {
    return {
      status: "critical",
      cause: `${input.overdueFilings} compliance filing${input.overdueFilings === 1 ? "" : "s"} overdue. ${board}.`,
    };
  }
  if (input.nextDue) {
    const days = Math.round(
      (Date.parse(input.nextDue.due) - Date.parse(input.todayISO)) / 86400000,
    );
    const cause = `Next filing: ${input.nextDue.title}, due ${input.nextDue.due}. ${board}.`;
    if (days <= 30) return { status: "due", cause };
    return { status: "healthy", cause };
  }
  return { status: "healthy", cause: `No filings owed. ${board}.` };
}

/** Data freshness — the metric_stale logic over the org's catalog, plus the
 *  A4 finding (computed definitions that can never refresh). */
export function composeFreshness(input: {
  activeMetrics: number;
  staleMetrics: number;
  unresolved: number;
}): HealthVerdict {
  if (input.activeMetrics === 0) {
    return { status: "neutral", cause: "No active metrics defined yet." };
  }
  const unresolvedNote =
    input.unresolved > 0
      ? ` ${input.unresolved} computed metric${input.unresolved === 1 ? "" : "s"} ha${input.unresolved === 1 ? "s" : "ve"} no resolver and can never refresh.`
      : "";
  const cause = `${input.staleMetrics} of ${input.activeMetrics} active metrics past their update cadence.${unresolvedNote}`;
  if (input.unresolved > 0 || input.staleMetrics > 3) return { status: "critical", cause };
  if (input.staleMetrics > 0) return { status: "watch", cause };
  return { status: "healthy", cause };
}
