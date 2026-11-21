/**
 * Strategy proof points: the "what's already true" figures shown before the
 * plan in the narrative (plan_foundation.proof_points).
 *
 * PURE, and the one place the rule lives: an org's narrative shows the org's
 * OWN proof points, or none. There is no fallback. (V4 Stage G; Phase 0
 * finding: the narrative used to fall back to Ambition Angels' headline
 * stats for any org that had not set its own, which put one tenant's
 * numbers on another tenant's screen.)
 */
export type ProofPoint = { value: string; label: string };

/** jsonb → proof points, defensively: a malformed row never breaks the render. */
export function parseProofPoints(raw: unknown): ProofPoint[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => {
      const o = (p ?? {}) as Partial<ProofPoint>;
      return { value: String(o.value ?? "").trim(), label: String(o.label ?? "").trim() };
    })
    .filter((p) => p.value);
}

/** The proof points to show for a foundation row: its own, or an empty list. */
export function proofPointsToShow(foundation: { proofPoints?: ProofPoint[] | null } | null | undefined): ProofPoint[] {
  return foundation?.proofPoints?.length ? foundation.proofPoints : [];
}
