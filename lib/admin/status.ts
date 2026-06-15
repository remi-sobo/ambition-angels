/**
 * The five-value status scale — one shared vocabulary for every pill in the
 * admin and for the Phase 4 briefing, so a color always means the same thing.
 * Tokens live in tailwind.config (`status.*`, Phase 0/1); this is the pure
 * mapping layer the <StatusChip> primitive and the engine both consume.
 *
 * Rule: only these five are "status". Anything else (taxonomy/category) is
 * rendered neutral with a category-colored dot — see CATEGORY_DOT below.
 */

export type Status = "critical" | "watch" | "due" | "healthy" | "neutral";

/** Chip styling: pale tint bg + ink-1 label (AAA on every tint) + saturated dot. */
export const STATUS_CHIP: Record<Status, { bg: string; dot: string }> = {
  critical: { bg: "bg-status-critical-bg", dot: "bg-status-critical" },
  watch: { bg: "bg-status-watch-bg", dot: "bg-status-watch" },
  due: { bg: "bg-status-due-bg", dot: "bg-status-due" },
  healthy: { bg: "bg-status-healthy-bg", dot: "bg-status-healthy" },
  neutral: { bg: "bg-status-neutral-bg", dot: "bg-ink-3" },
};

/** Task status → status scale. in_progress/todo carry no severity → neutral. */
export function taskStatusToStatus(s: string): Status {
  switch (s) {
    case "blocked":
      return "critical";
    case "done":
      return "healthy";
    case "todo":
    case "in_progress":
    default:
      return "neutral";
  }
}

/** Project status → status scale. */
export function projectStatusToStatus(s: string): Status {
  switch (s) {
    case "blocked":
    case "at_risk":
      return "critical";
    case "done":
    case "complete":
      return "healthy";
    case "active":
      return "due";
    default:
      return "neutral";
  }
}

// ── Prospect score tiers ────────────────────────────────────────────────────
// Presentational tiers for the Prospects table score badge (replaces the raw
// orange number). Hot prospects read healthy/green, warm read watch/amber,
// cool read neutral — a scannable gradient.
export const SCORE_TIER = { hot: 70, warm: 40 } as const;

export function scoreToStatus(score: number | null | undefined): Status {
  if (score == null) return "neutral";
  if (score >= SCORE_TIER.hot) return "healthy";
  if (score >= SCORE_TIER.warm) return "watch";
  return "neutral";
}

// ── Category (taxonomy) dot colors ──────────────────────────────────────────
// Categories are NOT status, so their chip is neutral (tile + ink-2); the hue
// survives only as a small dot. Kept muted-but-distinct and legible on cream.
export const CATEGORY_DOT: Record<string, string> = {
  fundraising: "#C0703C", // clay
  program: "#2F7D5B", // green
  product: "#5B6BB5", // indigo
  finance: "#A56A1B", // amber
  operations: "#8A5A12", // deep amber
  compliance: "#9E3A24", // deep red
  board: "#7A5BA8", // purple
  recruitment: "#2F7D8A", // teal
  admin: "#6B5C4E", // ink-2
  other: "#9A8B7C", // ink-3
};

export function categoryDot(category: string): string {
  return CATEGORY_DOT[category] ?? CATEGORY_DOT.other;
}
