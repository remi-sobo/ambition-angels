/**
 * Signal sources — each a pure function over one slice of the spine, returning
 * zero or more BriefingItems. No DB access here (the gather layer fetches);
 * no model calls (deterministic, explainable). Thresholds come from the
 * config module, never a hardcoded literal.
 */
import type { BriefingItem } from "../types";
import { FINANCE, TASKS, COMPLIANCE } from "../../thresholds";

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
