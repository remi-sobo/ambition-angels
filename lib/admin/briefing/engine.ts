/**
 * The briefing engine: collect signal-source items, filter out the ones the
 * operator has snoozed/dismissed/done, rank, and cap. Pure given its inputs
 * (the gather layer supplies the spine data and data-age) so it's fully
 * deterministic and unit-testable. The hard cap of 5 is load-bearing — a
 * briefing that shows everything is just another dashboard.
 */
import type { BriefingItem } from "./types";
import { SEVERITY_RANK } from "./types";
import {
  financeSource,
  tasksSource,
  complianceSource,
  majorGiftsSource,
  donorsSource,
  engagementSource,
  strategySource,
  type FinanceInput,
  type TasksInput,
  type ComplianceInput,
  type MajorGiftsInput,
  type DonorsInput,
  type EngagementInput,
  type StrategyInput,
  type SourceCtx,
} from "./sources";
import type { DataAge } from "../dataAge";

export const BRIEFING_CAP = 5;

export type GatheredInputs = {
  finance: FinanceInput;
  tasks: TasksInput;
  compliance: ComplianceInput;
  majorGifts: MajorGiftsInput;
  donors: DonorsInput;
  engagement: EngagementInput;
  /** Optional so existing callers/tests that predate the strategy source still typecheck. */
  strategy?: StrategyInput;
};

/** Per-item decision state (from the bloomos_briefing_state table). */
export type ItemState = {
  item_id: string;
  decision: string | null;
  hidden_until: string | null;
};

export type Briefing = {
  /** The capped feed (≤ BRIEFING_CAP). */
  top: BriefingItem[];
  /** How many ranked items are hidden behind "see all". */
  restCount: number;
  /** The full ranked list (for the "see all (N)" expansion). */
  items: BriefingItem[];
  computedAt: string;
};

/** severity → weight desc → due date asc → recency. */
export function rankItems(items: BriefingItem[]): BriefingItem[] {
  return [...items].sort((a, b) => {
    const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sev !== 0) return sev;
    if (b.weight !== a.weight) return b.weight - a.weight;
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    return b.computedAt.localeCompare(a.computedAt);
  });
}

export function isHidden(id: string, states: Map<string, ItemState>, now: number): boolean {
  const s = states.get(id);
  if (!s) return false;
  if (s.decision === "dismiss" || s.decision === "mark_done") return true;
  if (s.hidden_until && new Date(s.hidden_until).getTime() > now) return true;
  return false;
}

/** A stale spine is its own top item — so the operator never trusts a feed
 *  computed off three-week-old data without knowing it. */
function staleItem(dataAge: DataAge, now: number): BriefingItem | null {
  if (dataAge.severity !== "stale") return null;
  return {
    id: "sync:stale",
    source: "sync",
    severity: "critical",
    title: "The data is stale",
    detail: dataAge.lastFullSyncAt
      ? `Last full HubSpot sync was ${dataAge.ageLabel} ago — the numbers below may be out of date. Re-sync before deciding.`
      : "The spine has never fully synced — numbers below may be incomplete.",
    metric: dataAge.lastFullSyncAt ? `${dataAge.ageDays}d old` : "never synced",
    weight: 10_000, // always the top critical
    decisions: ["open", "dismiss"],
    deepLink: "/admin/briefing",
    computedAt: new Date(now).toISOString(),
    dataAgeDays: dataAge.ageDays,
    staleFlag: false, // the staleness IS the item, not derived off stale data
  };
}

export function buildBriefing(
  gathered: GatheredInputs,
  dataAge: DataAge,
  states: Map<string, ItemState>,
  now: number = Date.now(),
): Briefing {
  const ctx: SourceCtx = {
    now,
    dataAgeDays: dataAge.ageDays,
    staleFlag: dataAge.severity === "stale",
  };

  const raw: BriefingItem[] = [
    ...financeSource(gathered.finance, ctx),
    ...tasksSource(gathered.tasks, ctx),
    ...complianceSource(gathered.compliance, ctx),
    ...majorGiftsSource(gathered.majorGifts, ctx),
    ...donorsSource(gathered.donors, ctx),
    ...engagementSource(gathered.engagement, ctx),
    ...(gathered.strategy ? strategySource(gathered.strategy, ctx) : []),
  ];
  const stale = staleItem(dataAge, now);
  if (stale) raw.push(stale);

  const visible = raw.filter((it) => !isHidden(it.id, states, now));
  const ranked = rankItems(visible);

  return {
    top: ranked.slice(0, BRIEFING_CAP),
    restCount: Math.max(0, ranked.length - BRIEFING_CAP),
    items: ranked,
    computedAt: new Date(now).toISOString(),
  };
}
