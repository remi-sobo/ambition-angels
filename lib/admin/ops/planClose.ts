import { rhythmModeForToday } from "./rhythmMode";

/**
 * Spec Work W1 (decision 1, resolved: URL-driven) — which ritual Plan & Close
 * opens. An explicit ?ritual=plan|close wins (the link from a Friday nudge, a
 * refresh mid-ritual); anything else falls back to the time-appropriate
 * default, exactly the doors page's logic: Mon–Wed lights Plan, Thu–Sun
 * lights Close (rhythmModeForToday).
 */
export type Ritual = "plan" | "close";

export function resolveRitual(param: string | undefined, dow?: number): Ritual {
  if (param === "plan" || param === "close") return param;
  return rhythmModeForToday(dow) === "monday_plan" ? "plan" : "close";
}

/** The default for today, for marking the time-lit switch pill. */
export function ritualForToday(dow?: number): Ritual {
  return rhythmModeForToday(dow) === "monday_plan" ? "plan" : "close";
}
