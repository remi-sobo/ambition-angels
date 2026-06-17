// Partner fit rubric — the seven dimensions the 2026 "Emerging Partners"
// workbook scored each org on. Each is rated 0–5; the overall priority
// score (0–100) is the average of the dimensions that have been scored,
// rescaled. Shared by the editor (client) and the page/list (server), so
// no "use client" here.

export const RUBRIC_FACTORS = [
  { key: "geography", label: "Geography alignment", help: "Bay Area / target-region fit" },
  { key: "student_volume", label: "Student volume", help: "How many teens they can reach" },
  { key: "execution_readiness", label: "Execution readiness", help: "Capacity to run the program well" },
  { key: "funding_connectivity", label: "Funding connectivity", help: "Ties to funders / donor network" },
  { key: "collab_fundraising", label: "Collab fundraising", help: "Potential to raise together" },
  { key: "relational_fit", label: "Relational fit", help: "Warmth + strength of the relationship" },
  { key: "population_fit", label: "Population priority fit", help: "Serves our priority youth" },
] as const;

export type RubricKey = (typeof RUBRIC_FACTORS)[number]["key"];
export type ScoreFactors = Partial<Record<RubricKey, number>>;

export const RUBRIC_MAX = 5; // per-dimension max

// Overall 0–100 from the scored dimensions (unscored ones are ignored, so a
// partially-scored org isn't penalised). Returns null when nothing's scored.
export function scoreFromFactors(factors: ScoreFactors | null | undefined): number | null {
  if (!factors) return null;
  const vals = RUBRIC_FACTORS
    .map((f) => factors[f.key])
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (vals.length === 0) return null;
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  return Math.round((avg / RUBRIC_MAX) * 100);
}

// Clean an arbitrary object into a valid ScoreFactors (0–RUBRIC_MAX ints).
export function sanitizeFactors(input: unknown): ScoreFactors {
  const out: ScoreFactors = {};
  if (!input || typeof input !== "object") return out;
  const obj = input as Record<string, unknown>;
  for (const f of RUBRIC_FACTORS) {
    const n = Number(obj[f.key]);
    if (Number.isFinite(n) && n >= 0) out[f.key] = Math.max(0, Math.min(RUBRIC_MAX, Math.round(n)));
  }
  return out;
}

// Colour band for a 0–100 score (chips / bars).
export function scoreBand(score: number | null): "high" | "mid" | "low" | "none" {
  if (score == null) return "none";
  if (score >= 70) return "high";
  if (score >= 45) return "mid";
  return "low";
}

export const SCORE_BAND_STYLE: Record<"high" | "mid" | "low" | "none", string> = {
  high: "bg-revenue/15 text-revenue",
  mid: "bg-orange/15 text-orange",
  low: "bg-tile text-ink-2 border border-outline",
  none: "bg-tile text-ink-3 border border-outline",
};
