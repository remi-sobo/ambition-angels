/**
 * One AI cost model for the whole app.
 *
 * Reed and the funder-research agent each carried their own copy of the same
 * "(in*priceIn + out*priceOut) / 1e6" math with a per-model price baked in. That
 * is the seam a unified per-org spend ledger needs, so the prices live here once
 * and every caller delegates. Numbers are unchanged from the prior per-agent
 * constants, so existing cost_usd values stay comparable.
 *
 * Cache read/creation tokens are folded into the input count by callers (the
 * agents already do this), so this model prices input and output only.
 */

export type ModelPricing = {
  /** USD per million input tokens (list price). */
  inputPerMillionUsd: number;
  /** USD per million output tokens (list price). */
  outputPerMillionUsd: number;
};

// List prices, USD per million tokens. Keep in sync with the model tiers in
// lib/ai/gateway.ts and the per-agent model constants.
const PRICING: Record<string, ModelPricing> = {
  "claude-sonnet-4-6": { inputPerMillionUsd: 3, outputPerMillionUsd: 15 },
  "claude-opus-4-7": { inputPerMillionUsd: 15, outputPerMillionUsd: 75 },
  "claude-opus-4-8": { inputPerMillionUsd: 15, outputPerMillionUsd: 75 },
};

// Unknown models fall back to Sonnet pricing: the cheaper-of-the-pair, so an
// unpriced model never silently over-bills a tenant's cap.
const DEFAULT_PRICING: ModelPricing = { inputPerMillionUsd: 3, outputPerMillionUsd: 15 };

/** Price sheet for a model id, falling back to Sonnet pricing when unknown. */
export function pricingFor(model: string): ModelPricing {
  return PRICING[model] ?? DEFAULT_PRICING;
}

/** Estimate the USD cost of one call from its token counts. */
export function estimateCostUsd(model: string, tokensInput: number, tokensOutput: number): number {
  const p = pricingFor(model);
  return (tokensInput * p.inputPerMillionUsd + tokensOutput * p.outputPerMillionUsd) / 1_000_000;
}
