// Pure pieces of the V4 Pipeline board (Pipeline.dc.html): column counts and
// totals, the one urgency signal per card, the built-in views and search.
// Shared by the board and its tests.
import { daysBetween, shortDay } from "./donorRecord";

export type BoardOpp = {
  id: string;
  label: string;
  constituentName: string;
  stage: string;
  askAmount: number | null;
  expectedClose: string | null;
  nextStep: string | null;
  nextStepDue: string | null;
  owner: string | null;
};

export type BoardStage = { key: string; label: string; stageType: "open" | "won" | "lost" | "on_hold" | string };

export type ColumnStat = { key: string; label: string; count: number; total: number };

/** Count and total asked per column, in stage order. Cards whose stage is
 *  not a column are not counted anywhere (they are not on the board). */
export function columnStats(opps: readonly BoardOpp[], stages: readonly BoardStage[]): ColumnStat[] {
  return stages.map((s) => {
    const inCol = opps.filter((o) => o.stage === s.key);
    return {
      key: s.key,
      label: s.label,
      count: inCol.length,
      total: Math.round(inCol.reduce((sum, o) => sum + (o.askAmount ?? 0), 0) * 100) / 100,
    };
  });
}

export type Urgency = { text: string; tone: "late" | "missing" | "soon" | "calm" | "none" };

/**
 * The card's one urgency signal. Open asks: a late next step says how late,
 * a missing one asks for one, else when it is due. Won, lost and on-hold
 * cards carry none.
 */
export function cardUrgency(opp: BoardOpp, stageType: string, today: string): Urgency {
  if (stageType !== "open") return { text: "", tone: "none" };
  if (!opp.nextStep) return { text: "No next step yet", tone: "missing" };
  if (!opp.nextStepDue) return { text: "No due date", tone: "calm" };
  const d = daysBetween(today, opp.nextStepDue);
  if (d < 0) return { text: `${-d} day${d === -1 ? "" : "s"} late`, tone: "late" };
  if (d === 0) return { text: "Due today", tone: "soon" };
  if (d <= 7) return { text: `Due ${shortDay(opp.nextStepDue, today)}`, tone: "soon" };
  return { text: `Due ${shortDay(opp.nextStepDue, today)}`, tone: "calm" };
}

/** The last day of today's calendar quarter. */
export function quarterEnd(today: string): string {
  const y = +today.slice(0, 4);
  const q = Math.floor((+today.slice(5, 7) - 1) / 3);
  const endMonth = q * 3 + 3; // 3, 6, 9, 12
  const last = new Date(Date.UTC(y, endMonth, 0)).getUTCDate();
  return `${y}-${String(endMonth).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

export const BOARD_VIEWS = [
  { key: "all", label: "All asks" },
  { key: "quarter", label: "Closing this quarter" },
  { key: "late", label: "Late next step" },
  { key: "no_next", label: "No next step" },
] as const;
export type BoardViewKey = (typeof BOARD_VIEWS)[number]["key"];

export function isBoardView(v: unknown): v is BoardViewKey {
  return BOARD_VIEWS.some((b) => b.key === v);
}

/** Apply a built-in view. Views about next steps only look at open asks. */
export function applyBoardView(
  opps: readonly BoardOpp[],
  view: BoardViewKey,
  stageTypeOf: (stage: string) => string,
  today: string,
): BoardOpp[] {
  const open = (o: BoardOpp) => stageTypeOf(o.stage) === "open";
  switch (view) {
    case "quarter": {
      const end = quarterEnd(today);
      const start = quarterStart(today);
      return opps.filter((o) => open(o) && !!o.expectedClose && o.expectedClose >= start && o.expectedClose <= end);
    }
    case "late":
      return opps.filter((o) => open(o) && !!o.nextStep && !!o.nextStepDue && o.nextStepDue < today);
    case "no_next":
      return opps.filter((o) => open(o) && !o.nextStep);
    default:
      return [...opps];
  }
}

/** The first day of today's calendar quarter. */
export function quarterStart(today: string): string {
  const q = Math.floor((+today.slice(5, 7) - 1) / 3);
  return `${today.slice(0, 4)}-${String(q * 3 + 1).padStart(2, "0")}-01`;
}

/** Case-insensitive match on the ask, donor, next step and owner text. */
export function searchOpps(opps: readonly BoardOpp[], q: string): BoardOpp[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [...opps];
  return opps.filter((o) =>
    [o.label, o.constituentName, o.nextStep, o.owner].some((f) => (f ?? "").toLowerCase().includes(needle)),
  );
}

export type BoardSummary = {
  openTotal: number;
  openCount: number;
  quarterTotal: number;
  quarterCount: number;
  noNextStep: number;
  late: number;
  wonTotal: number;
  wonCount: number;
};

/** The summary strip over the cards in view. */
export function boardSummary(opps: readonly BoardOpp[], stageTypeOf: (stage: string) => string, today: string): BoardSummary {
  const open = opps.filter((o) => stageTypeOf(o.stage) === "open");
  const won = opps.filter((o) => stageTypeOf(o.stage) === "won");
  const qs = quarterStart(today);
  const qe = quarterEnd(today);
  const closing = open.filter((o) => !!o.expectedClose && o.expectedClose >= qs && o.expectedClose <= qe);
  const sum = (xs: BoardOpp[]) => Math.round(xs.reduce((s, o) => s + (o.askAmount ?? 0), 0) * 100) / 100;
  return {
    openTotal: sum(open),
    openCount: open.length,
    quarterTotal: sum(closing),
    quarterCount: closing.length,
    noNextStep: open.filter((o) => !o.nextStep).length,
    late: open.filter((o) => !!o.nextStep && !!o.nextStepDue && o.nextStepDue < today).length,
    wonTotal: sum(won),
    wonCount: won.length,
  };
}

/** Where a keyboard "Move to" lands: every other column, in order. */
export function moveTargets(stages: readonly BoardStage[], current: string): BoardStage[] {
  return stages.filter((s) => s.key !== current);
}
