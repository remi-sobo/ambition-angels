/**
 * Signal sources — each a pure function over one slice of the spine, returning
 * zero or more BriefingItems. No DB access here (the gather layer fetches);
 * no model calls (deterministic, explainable). Thresholds come from the
 * config module, never a hardcoded literal.
 */
import type { BriefingItem } from "../types";
import { FINANCE, TASKS, COMPLIANCE, MAJOR_GIFTS, DONORS, ENGAGEMENT } from "../../thresholds";

export type SourceCtx = {
  now: number;
  /** Age (days) of the spine these inputs came from; stamped on every item. */
  dataAgeDays: number | null;
  /** True when the spine is stale enough that derived numbers are suspect. */
  staleFlag: boolean;
};

const DAY = 86_400_000;
const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function daysUntil(dateIso: string, now: number): number {
  // Whole days from `now` to the date (negative = overdue).
  const d = new Date(dateIso + "T00:00:00Z").getTime();
  return Math.floor((d - now) / DAY);
}

function stamp(ctx: SourceCtx) {
  return {
    computedAt: new Date(ctx.now).toISOString(),
    dataAgeDays: ctx.dataAgeDays,
    staleFlag: ctx.staleFlag,
  };
}

// ── Finance ─────────────────────────────────────────────────────────────────

export type FinanceInput = { runwayMonths: number | null; cashOnHand: number };

export function financeSource(input: FinanceInput, ctx: SourceCtx): BriefingItem[] {
  const items: BriefingItem[] = [];
  const { runwayMonths, cashOnHand } = input;

  if (runwayMonths != null) {
    if (runwayMonths <= FINANCE.runwayCriticalMonths) {
      items.push({
        id: "finance:runway",
        source: "finance",
        severity: "critical",
        title: "Runway is critically short",
        detail: `${runwayMonths.toFixed(1)} months of runway at the current burn — below the ${FINANCE.runwayCriticalMonths}-month floor.`,
        metric: `${runwayMonths.toFixed(1)} mo`,
        weight: 1_000 - runwayMonths, // shorter runway sorts first
        decisions: ["open", "snooze", "dismiss"],
        deepLink: "/admin/finance",
        ...stamp(ctx),
      });
    } else if (runwayMonths <= FINANCE.runwayWatchMonths) {
      items.push({
        id: "finance:runway",
        source: "finance",
        severity: "watch",
        title: "Runway is getting short",
        detail: `${runwayMonths.toFixed(1)} months of runway — under the ${FINANCE.runwayWatchMonths}-month comfort line.`,
        metric: `${runwayMonths.toFixed(1)} mo`,
        weight: 500 - runwayMonths,
        decisions: ["open", "snooze", "dismiss"],
        deepLink: "/admin/finance",
        ...stamp(ctx),
      });
    }
  }

  if (cashOnHand <= FINANCE.cashFloorUsd) {
    items.push({
      id: "finance:cash",
      source: "finance",
      severity: "watch",
      title: "Cash on hand is below the floor",
      detail: `${usd(cashOnHand)} in the bank — under the ${usd(FINANCE.cashFloorUsd)} floor.`,
      metric: usd(cashOnHand),
      weight: FINANCE.cashFloorUsd - cashOnHand,
      decisions: ["open", "snooze", "dismiss"],
      deepLink: "/admin/finance",
      ...stamp(ctx),
    });
  }

  return items;
}

// ── Tasks ───────────────────────────────────────────────────────────────────

export type TaskLite = { id: string; title: string; due_date: string | null; status: string };
export type TasksInput = { tasks: TaskLite[] };

const TASK_OPEN = (s: string) => s !== "done";

export function tasksSource(input: TasksInput, ctx: SourceCtx): BriefingItem[] {
  const today = new Date(ctx.now).toISOString().slice(0, 10);
  const overdue = input.tasks
    .filter((t) => TASK_OPEN(t.status) && t.due_date != null && t.due_date < today)
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1)); // oldest first

  if (overdue.length === 0) return [];

  const oldest = overdue[0];
  const severity =
    overdue.length >= TASKS.overdueCriticalCount ? "critical" : "watch";

  return [
    {
      id: "tasks:overdue",
      source: "tasks",
      severity,
      title: `${overdue.length} task${overdue.length === 1 ? "" : "s"} overdue`,
      detail: `Oldest: “${oldest.title}”, due ${oldest.due_date}.`,
      metric: String(overdue.length),
      weight: overdue.length,
      dueDate: oldest.due_date ?? undefined,
      decisions: ["open", "snooze", "dismiss"],
      deepLink: "/admin/ops",
      ...stamp(ctx),
    },
  ];
}

// ── Compliance ──────────────────────────────────────────────────────────────

export type ComplianceLite = {
  id: string;
  title: string;
  due_date: string;
  status: string;
  jurisdiction: string | null;
};
export type ComplianceInput = { items: ComplianceLite[] };

const COMPLIANCE_OPEN = (s: string) => s === "upcoming" || s === "in_progress";

export function complianceSource(input: ComplianceInput, ctx: SourceCtx): BriefingItem[] {
  const out: BriefingItem[] = [];
  for (const item of input.items) {
    if (!COMPLIANCE_OPEN(item.status)) continue;
    const days = daysUntil(item.due_date, ctx.now);
    const where = item.jurisdiction && item.jurisdiction !== "—" ? ` (${item.jurisdiction})` : "";

    if (days < 0) {
      out.push({
        id: `compliance:${item.id}`,
        source: "compliance",
        severity: "critical",
        title: `Compliance overdue: ${item.title}`,
        detail: `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} past due${where}.`,
        metric: `${Math.abs(days)}d late`,
        weight: 1_000 + Math.abs(days), // more overdue sorts first
        dueDate: item.due_date,
        decisions: ["open", "mark_done", "snooze", "dismiss"],
        deepLink: "/admin/compliance",
        ...stamp(ctx),
      });
    } else if (days <= COMPLIANCE.dueSoonDays) {
      out.push({
        id: `compliance:${item.id}`,
        source: "compliance",
        severity: "due_soon",
        title: `Compliance due soon: ${item.title}`,
        detail: `Due in ${days} day${days === 1 ? "" : "s"}${where}.`,
        metric: `${days}d`,
        weight: COMPLIANCE.dueSoonDays - days, // sooner sorts first
        dueDate: item.due_date,
        decisions: ["open", "mark_done", "snooze", "dismiss"],
        deepLink: "/admin/compliance",
        ...stamp(ctx),
      });
    }
  }
  return out;
}

// ── Major gifts ─────────────────────────────────────────────────────────────

export type OpportunityLite = {
  id: string;
  name: string;
  ask_amount: number | null;
  next_step: string | null;
  next_step_due: string | null;
};
export type MajorGiftsInput = { opportunities: OpportunityLite[] };

export function majorGiftsSource(input: MajorGiftsInput, ctx: SourceCtx): BriefingItem[] {
  const today = new Date(ctx.now).toISOString().slice(0, 10);
  const out: BriefingItem[] = [];

  const overdue = input.opportunities.filter(
    (o) => o.next_step_due != null && o.next_step_due < today,
  );
  if (overdue.length > 0) {
    const atStake = overdue.reduce((s, o) => s + (o.ask_amount ?? 0), 0);
    const severity = overdue.length >= MAJOR_GIFTS.overdueStepCriticalCount ? "critical" : "watch";
    out.push({
      id: "major_gifts:overdue_step",
      source: "major_gifts",
      severity,
      title: `${overdue.length} ask${overdue.length === 1 ? "" : "s"} with an overdue next step`,
      detail: `${usd(atStake)} in asks have a next step past due — oldest: “${overdue[0].name}”.`,
      metric: usd(atStake),
      weight: atStake,
      decisions: ["open", "snooze", "dismiss"],
      deepLink: "/admin/fundraising",
      ...stamp(ctx),
    });
  }

  const stuck = input.opportunities.filter(
    (o) => o.next_step == null && (o.ask_amount ?? 0) >= MAJOR_GIFTS.dollarFloorUsd,
  );
  if (stuck.length > 0) {
    const atStake = stuck.reduce((s, o) => s + (o.ask_amount ?? 0), 0);
    out.push({
      id: "major_gifts:no_step",
      source: "major_gifts",
      severity: "watch",
      title: `${stuck.length} high-value ask${stuck.length === 1 ? "" : "s"} with no next step`,
      detail: `${usd(atStake)} sitting without a planned move.`,
      metric: usd(atStake),
      weight: atStake - 1, // just under overdue at equal dollars
      decisions: ["open", "snooze", "dismiss"],
      deepLink: "/admin/fundraising",
      ...stamp(ctx),
    });
  }

  return out;
}

// ── Donors (acknowledgments) ────────────────────────────────────────────────

export type PendingGiftLite = { id: string; amount: number; gift_date: string };
export type DonorsInput = { pendingGifts: PendingGiftLite[] };

export function donorsSource(input: DonorsInput, ctx: SourceCtx): BriefingItem[] {
  const cutoff = new Date(ctx.now - DONORS.ackWindowDays * DAY).toISOString().slice(0, 10);
  const pastWindow = input.pendingGifts.filter((g) => g.gift_date <= cutoff);
  if (pastWindow.length === 0) return [];

  const irs = pastWindow.filter((g) => g.amount >= DONORS.irsThresholdUsd);
  const severity = irs.length > 0 ? "critical" : "watch";
  const detail =
    irs.length > 0
      ? `${pastWindow.length} unacknowledged past ${DONORS.ackWindowDays} days — ${irs.length} are ≥ ${usd(DONORS.irsThresholdUsd)} and need a written receipt (IRS Pub 1771).`
      : `${pastWindow.length} gifts have waited more than ${DONORS.ackWindowDays} days for a thank-you.`;

  return [
    {
      id: "donors:acks",
      source: "donors",
      severity,
      title: `${pastWindow.length} gift${pastWindow.length === 1 ? "" : "s"} awaiting acknowledgment`,
      detail,
      metric: String(pastWindow.length),
      weight: irs.length * 1_000 + pastWindow.length,
      decisions: ["open", "snooze", "dismiss"],
      deepLink: "/admin/fundraising/acknowledgments",
      ...stamp(ctx),
    },
  ];
}

// ── Engagement (cohort attendance) ──────────────────────────────────────────

export type SessionLite = { id: string; session_date: string; hasAttendance: boolean };
export type EngagementInput = { sessions: SessionLite[] };

export function engagementSource(input: EngagementInput, ctx: SourceCtx): BriefingItem[] {
  const cutoff = new Date(ctx.now - ENGAGEMENT.attendanceGraceDays * DAY).toISOString().slice(0, 10);
  const missing = input.sessions.filter((s) => !s.hasAttendance && s.session_date <= cutoff);
  if (missing.length === 0) return [];

  return [
    {
      id: "engagement:attendance",
      source: "engagement",
      severity: "watch",
      title: `${missing.length} cohort session${missing.length === 1 ? "" : "s"} missing attendance`,
      detail: `Attendance hasn't been recorded for ${missing.length} session${missing.length === 1 ? "" : "s"} held more than ${ENGAGEMENT.attendanceGraceDays} days ago.`,
      metric: String(missing.length),
      weight: missing.length,
      decisions: ["open", "snooze", "dismiss"],
      deepLink: "/admin/cohorts",
      ...stamp(ctx),
    },
  ];
}
