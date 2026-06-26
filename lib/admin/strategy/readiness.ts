/**
 * Funder-Readiness Linter (spec: specs/strategy-plan-funder-readiness.md, B2-5).
 *
 * Scores a plan against the rules a consultant would check before it's shown to
 * a funder, and lists every blocker. It reads the SAME three movements the
 * funder sees (getPlanMovement / getRaiseMovement / getHowMovement) plus a thin
 * slice of plan_goals, so the linter can never disagree with the surface — it
 * grades exactly what renders.
 *
 * Two severities:
 *   - blocker  — a credibility failure; presenter mode warns hard on these.
 *   - advisory — readiness polish (baselines, owners, dates, residual to source).
 *
 * Every value the checks touch is editable at its source (Principle #0), so a
 * failing check always has somewhere to go fix it (`fixHref`).
 */
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { FINANCE } from "@/lib/admin/thresholds";
import { getPlanMovement, getRaiseMovement, getHowMovement } from "@/lib/admin/strategy/narrative";

export type ReadinessSeverity = "blocker" | "advisory";

export type ReadinessCheck = {
  id: string;
  severity: ReadinessSeverity;
  ok: boolean;
  /** What the check verifies, in funder terms. */
  label: string;
  /** The live finding — passing or failing — with the numbers behind it. */
  detail: string;
  /** Where to go fix it (an admin route), when not ok. */
  fixHref?: string;
};

export type Readiness = {
  checks: ReadinessCheck[];
  blockers: ReadinessCheck[];
  advisories: ReadinessCheck[];
  /** Hard blockers still open — presenter mode warns when > 0. */
  blockerCount: number;
  score: { passed: number; total: number; pct: number };
};

const PLAN_HREF = "/admin/strategic-plan";
const FUND_HREF = "/admin/fundraising/strategy";

const usd = (n: number) =>
  `$${Math.round(n).toLocaleString("en-US")}`;

export async function getReadiness(orgId: string): Promise<Readiness> {
  const sb = getSupabaseAdmin();
  const [plan, money, how, goalsRes] = await Promise.all([
    getPlanMovement(orgId),
    getRaiseMovement(orgId),
    getHowMovement(orgId),
    sb.from("plan_goals").select("id, title, target_date").eq("org_id", orgId),
  ]);

  const checks: ReadinessCheck[] = [];
  const add = (c: ReadinessCheck) => checks.push(c);

  // Every measure across the plan tree (the leaves a funder reads).
  const kpis = plan.objectives.flatMap((o) => [...o.objectiveKpis, ...o.goals.flatMap((g) => g.kpis)]);

  // ── BLOCKERS ────────────────────────────────────────────────────────────

  // B1 — the committed floor must be set (everything keys off it).
  add({
    id: "floor_set",
    severity: "blocker",
    ok: money.floor != null,
    label: "Committed floor is set",
    detail: money.floor != null ? `Floor ${usd(money.floor)}.` : "No committed-floor target — set dollars_raised_fy26.",
    fixHref: PLAN_HREF,
  });

  // B2 — the floor must decompose into channel sources that sum to it (F5).
  const sourceSum = money.sources.reduce((s, x) => s + x.amount, 0);
  const sourcesOk = money.floor != null && money.sources.length > 0 && Math.abs(sourceSum - money.floor) <= 1;
  add({
    id: "sources_sum_floor",
    severity: "blocker",
    ok: sourcesOk,
    label: "Floor is sourced channel-by-channel and sums to the floor",
    detail:
      money.sources.length === 0
        ? "No floor-by-source breakdown yet."
        : money.floor != null && Math.abs(sourceSum - money.floor) > 1
          ? `Sources total ${usd(sourceSum)} but the floor is ${usd(money.floor)} — off by ${usd(Math.abs(sourceSum - (money.floor ?? 0)))}.`
          : `${money.sources.length} channels summing to ${usd(sourceSum)}.`,
    fixHref: PLAN_HREF,
  });

  // B3 — no internal strategy language in any funder-facing door copy (F1).
  const internalMarker = /\[internal\]|do not lead|reject cold|lands better|stub/i;
  const leaky = how.angles.filter((a) => internalMarker.test(`${a.hook ?? ""} ${a.ask ?? ""}`));
  add({
    id: "no_internal_leak",
    severity: "blocker",
    ok: leaky.length === 0,
    label: "No internal strategy notes in funder-facing copy",
    detail: leaky.length === 0 ? "All door copy is funder-safe." : `Internal language found in: ${leaky.map((a) => a.name).join(", ")}.`,
    fixHref: FUND_HREF,
  });

  // B4 — at least one funder-facing door has a mapped prospect (F15).
  const doorsWithProspects = how.angles.filter((a) => a.funderCount > 0).length;
  add({
    id: "doors_have_prospects",
    severity: "blocker",
    ok: doorsWithProspects > 0,
    label: "Funding doors have mapped prospects",
    detail:
      doorsWithProspects > 0
        ? `${doorsWithProspects} of ${how.angles.length} doors have at least one mapped funder.`
        : "No door has a mapped prospect — the pipeline can't be traced to the plan.",
    fixHref: FUND_HREF,
  });

  // ── ADVISORIES ──────────────────────────────────────────────────────────

  // A1 — residual still to source after a realistic close (F6). Acknowledged is
  // fine; this surfaces the number so it's never a surprise.
  if (money.residual != null && money.residual > 0) {
    add({
      id: "residual_to_source",
      severity: "advisory",
      ok: false,
      label: "Residual to the floor named as coverage",
      detail: `${usd(money.residual)} of net-new still to name against the doors after a realistic close.`,
      fixHref: FUND_HREF,
    });
  }

  // A2 — runway above the watch line, or a bridge shown (F7).
  if (money.runwayMonths != null) {
    const healthy = money.runwayMonths >= FINANCE.runwayWatchMonths;
    add({
      id: "runway",
      severity: "advisory",
      ok: healthy,
      label: `Runway at/above the ${FINANCE.runwayWatchMonths}-month line`,
      detail: healthy
        ? `${money.runwayMonths.toFixed(1)} months on hand.`
        : `${money.runwayMonths.toFixed(1)} months — a ${usd(money.runwayBridge)} bridge is shown to restore the cushion.`,
      fixHref: PLAN_HREF,
    });
  }

  // A3 — every measure has a current value, not a wall of blanks (F11).
  const blankKpis = kpis.filter((k) => k.current == null);
  add({
    id: "kpis_have_values",
    severity: "advisory",
    ok: blankKpis.length === 0,
    label: "Every measure has a current value",
    detail: blankKpis.length === 0 ? `All ${kpis.length} measures carry a value.` : `${blankKpis.length} of ${kpis.length} measures have no current value yet.`,
    fixHref: PLAN_HREF,
  });

  // A4 — every objective and goal has an owner (F13).
  const ownerless = [
    ...plan.objectives.filter((o) => !o.owner).map((o) => o.title),
    ...plan.objectives.flatMap((o) => o.goals.filter((g) => !g.owner).map((g) => g.title)),
  ];
  add({
    id: "owners",
    severity: "advisory",
    ok: ownerless.length === 0,
    label: "Every objective and goal has an owner",
    detail: ownerless.length === 0 ? "All owned." : `${ownerless.length} without an owner.`,
    fixHref: PLAN_HREF,
  });

  // A5 — goals carry a target date, so the plan shows "by when" (F10).
  const goals = goalsRes.data ?? [];
  const undated = goals.filter((g) => !g.target_date);
  add({
    id: "goal_dates",
    severity: "advisory",
    ok: goals.length > 0 && undated.length === 0,
    label: "Goals carry a target date",
    detail: goals.length === 0 ? "No goals yet." : undated.length === 0 ? "All goals dated." : `${undated.length} of ${goals.length} goals have no target date.`,
    fixHref: PLAN_HREF,
  });

  const blockers = checks.filter((c) => c.severity === "blocker");
  const advisories = checks.filter((c) => c.severity === "advisory");
  const passed = checks.filter((c) => c.ok).length;
  const total = checks.length;
  return {
    checks,
    blockers,
    advisories,
    blockerCount: blockers.filter((c) => !c.ok).length,
    score: { passed, total, pct: total ? Math.round((passed / total) * 100) : 100 },
  };
}
