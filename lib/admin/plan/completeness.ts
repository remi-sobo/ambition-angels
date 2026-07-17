/**
 * Plan completeness (strategy builders, spec #6 §6): the pure rule for what
 * makes a strategy FUNCTIONING, shared by the plan page's build/finish hero
 * and the setup wizard. Soft by design — it names gaps, it never blocks a
 * save (spec §10.2).
 *
 * Functioning = mission present (and not an unedited template placeholder),
 * ≥3 objectives, every objective has ≥1 goal, every goal has ≥1 measure.
 * Initiatives and the review cadence are the wizard's extra polish steps,
 * deliberately not part of the core threshold.
 */

export type PlanShape = {
  mission: string | null;
  objectives: { id: string; title: string }[];
  /** goal → its objective (null = orphan). */
  goals: { id: string; objective_id: string | null }[];
  /** measure → its goal (objective-only measures carry null). */
  kpis: { goal_id: string | null }[];
};

export type Completeness = {
  functioning: boolean;
  /** Human-readable gaps, in fix-first order. Empty when functioning. */
  gaps: string[];
  /** True when nothing exists at all — the "build" (vs "finish") state. */
  empty: boolean;
};

/** Template placeholders are bracketed ("[Your mission…]") — an unedited one
 *  counts as missing (spec §9). */
export function isPlaceholder(text: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  return t.startsWith("[") && t.endsWith("]");
}

export function planCompleteness(plan: PlanShape): Completeness {
  const gaps: string[] = [];

  const missionSet = !!plan.mission?.trim() && !isPlaceholder(plan.mission);
  if (!missionSet) gaps.push("a mission");

  if (plan.objectives.length === 0) {
    gaps.push("objectives (aim for 3–5 standing pillars)");
  } else if (plan.objectives.length < 3) {
    gaps.push(`${3 - plan.objectives.length} more objective${plan.objectives.length === 2 ? "" : "s"} (aim for 3–5)`);
  }

  const goalsByObjective = new Set(
    plan.goals.filter((g) => g.objective_id).map((g) => g.objective_id as string),
  );
  const objectivesNoGoals = plan.objectives.filter((o) => !goalsByObjective.has(o.id));
  if (plan.objectives.length > 0 && objectivesNoGoals.length > 0) {
    gaps.push(
      objectivesNoGoals.length === 1
        ? `a goal under “${objectivesNoGoals[0].title}”`
        : `goals under ${objectivesNoGoals.length} objectives`,
    );
  }

  const goalsWithKpi = new Set(plan.kpis.filter((k) => k.goal_id).map((k) => k.goal_id as string));
  const goalsNoMeasure = plan.goals.filter((g) => !goalsWithKpi.has(g.id));
  if (plan.goals.length > 0 && goalsNoMeasure.length > 0) {
    gaps.push(
      `a measure on ${goalsNoMeasure.length} goal${goalsNoMeasure.length === 1 ? "" : "s"}`,
    );
  }

  const empty = !plan.mission?.trim() && plan.objectives.length === 0 && plan.goals.length === 0;
  return { functioning: gaps.length === 0, gaps, empty };
}
