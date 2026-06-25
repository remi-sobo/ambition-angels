/**
 * Reed cost model and per-tenant monthly cap (Phase 4).
 *
 * Reed's Ask runs on Sonnet (cheap, conversational) — see REED_ASK_MODEL. Cost
 * is estimated from token counts the same way the funder agent does, so the
 * numbers in reed_activity_log.cost_usd are comparable across the two agents.
 *
 * The cap is a flat per-org monthly ceiling for now (Open Decision 5 — "cost cap
 * per plan" — is unresolved; when billing lands, this moves onto the entitlement
 * row / plan). Mirrors the funder agent's hard-cap pattern: summed month-to-date,
 * checked BEFORE the model call.
 */

export const REED_ASK_MODEL = "claude-sonnet-4-6";

// Sonnet 4.6 list price (USD per million tokens).
const SONNET_INPUT_PER_MILLION_USD = 3;
const SONNET_OUTPUT_PER_MILLION_USD = 15;

export function estimateReedCostUsd(tokensInput: number, tokensOutput: number): number {
  return (
    (tokensInput * SONNET_INPUT_PER_MILLION_USD +
      tokensOutput * SONNET_OUTPUT_PER_MILLION_USD) /
    1_000_000
  );
}

/** Flat per-org monthly ceiling for Reed Ask, in USD. */
export const REED_MONTHLY_CAP_USD = 25;
/** Warn (don't block) once month-to-date crosses this. */
export const REED_MONTHLY_WARN_USD = 18;
