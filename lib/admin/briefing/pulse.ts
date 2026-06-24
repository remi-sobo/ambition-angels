/**
 * Executive Briefing v2 — the "pulse" strip: the CEO's at-a-glance vital signs,
 * computed deterministically from the spine the gather layer already loaded.
 * Pure (no DB access here) so it stays testable and the gather layer owns I/O.
 */
import type { FinanceSnapshot } from "../finance";
import type { OpportunityLite } from "./sources";

export type Pulse = {
  /** Months of runway at the current burn; null when burn can't be computed. */
  runwayMonths: number | null;
  cashOnHand: number;
  /** Sum of ask_amount across open opportunities. */
  openPipelineUsd: number;
  /** Count of open opportunities (the "# asks" in the pipeline). */
  openAskCount: number;
  /** Fiscal-year revenue so far (the fundraising "raised" line). */
  raisedYtd: number;
  /** Annual fundraising goal from fin_config; 0 when unset. */
  goal: number;
  /** raisedYtd / goal as a 0–100+ percent; null when no goal is set. */
  pctToGoal: number | null;
};

export function buildPulse(finance: FinanceSnapshot, opportunities: OpportunityLite[]): Pulse {
  const openPipelineUsd = opportunities.reduce((s, o) => s + (o.ask_amount ?? 0), 0);
  const goal = finance.cfg.goal;
  const raisedYtd = finance.revenueYTD;
  return {
    runwayMonths: finance.runwayMonths,
    cashOnHand: finance.cashOnHand,
    openPipelineUsd,
    openAskCount: opportunities.length,
    raisedYtd,
    goal,
    pctToGoal: goal > 0 ? (raisedYtd / goal) * 100 : null,
  };
}
