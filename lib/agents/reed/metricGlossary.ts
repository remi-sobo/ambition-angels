/**
 * The locked finance formula texts explain_metric serves (spec #6, Phase 1).
 *
 * Pure module, no imports — shared by lib/agents/reed/tools.ts and the drift
 * guard in tests/reed-spine-tools.test.ts. The Metric Catalog
 * (metric_definitions.description) is the DEFAULT definition source;
 * everything here is the deliberate exception:
 *
 * - FINANCE_FORMULA_OVERLAY: verbatim locked formulas layered ON TOP of a
 *   catalog row, keyed by the catalog's metric_key. Every key here MUST exist
 *   in the catalog seed (the drift-guard test enforces it) — an overlay for a
 *   metric the catalog doesn't know is the one-number-two-definitions trap
 *   the catalog was built to end.
 * - TOOL_FIELD_GLOSSARY: definitions for figures that are FIELDS of Reed's
 *   finance/forecast tool results, not catalog metrics (there is no
 *   metric_definitions row for "forecast"). Keys here must NOT collide with
 *   catalog keys — if one graduates into the catalog, it moves to the overlay.
 * - METRIC_KEY_ALIASES: the pre-catalog names explain_metric used to accept,
 *   mapped to their catalog metric_key so old phrasing still resolves.
 */

export const FINANCE_FORMULA_OVERLAY: Record<string, string> = {
  cash_runway_months:
    "Cash on hand ÷ monthly burn. Null when there is no burn. ≤3 months is critical, ≤6 is a watch.",
  monthly_burn:
    "Average monthly expense over the last 3 active months (months with any revenue or expense).",
};

export const TOOL_FIELD_GLOSSARY: Record<string, string> = {
  cash_on_hand:
    "Reconciled starting balance + the sum of all ledger transactions dated after the anchor date.",
  raised_ytd:
    "Sum of gifts dated within the current fiscal year. The fundraising (gift) view, not the bank ledger.",
  committed: "Raised this FY + stewardship-stage asks (treated as committed).",
  weighted_open:
    "Σ(ask_amount × probability) over open stages (identify/qualify/cultivate/solicit); probability defaults to 50% when blank.",
  forecast: "Committed + weighted-open pipeline. Deliberately not total pipeline.",
  gap_to_goal: "Fundraising goal − forecast.",
};

export const METRIC_KEY_ALIASES: Record<string, string> = {
  runway: "cash_runway_months",
  burn: "monthly_burn",
};
