import { weekdayIndex } from "./week";

/**
 * The pure half of the rhythm module: which ritual the week's shape lights.
 * Split out of rhythm.ts at Spec Work W1 so Plan & Close's switch (and its
 * tests) can read the mode without dragging the server-only snapshot loader
 * along; rhythm.ts re-exports both names, so existing importers are
 * untouched.
 */
export type RhythmMode = "monday_plan" | "friday_close";

/** Mon–Wed lights Plan; Thu–Sun lights Close. dow: 0=Sun … 6=Sat. */
export function rhythmModeForToday(dow: number = weekdayIndex()): RhythmMode {
  return dow >= 1 && dow <= 3 ? "monday_plan" : "friday_close";
}
