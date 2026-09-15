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

/**
 * Badge styling: pale tint bg + a semantic label + a saturated dot.
 *
 * Visual System V3 §13 — each `text` step is the deepened type variant of its
 * hue (see tailwind.config.ts), chosen so it clears WCAG AA both on the
 * workspace and on its own tint. The `dot` is the vivid fill value, which is
 * fill-only and never sits behind a label.
 */
export const STATUS_CHIP: Record<Status, { bg: string; dot: string; text: string }> = {
  critical: {
    bg: "bg-status-critical-bg",
    dot: "bg-status-critical",
    text: "text-status-critical-text",
  },
  watch: {
    bg: "bg-status-watch-bg",
    dot: "bg-status-watch",
    text: "text-status-watch-text",
  },
  due: { bg: "bg-status-due-bg", dot: "bg-status-due", text: "text-status-due-text" },
  healthy: {
    bg: "bg-status-healthy-bg",
    dot: "bg-status-healthy",
    text: "text-status-healthy-text",
  },
  neutral: { bg: "bg-status-neutral-bg", dot: "bg-ink-3", text: "text-ink-2" },
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

/**
 * Plan health scale (objective / goal / KPI: not_started · on_track · at_risk ·
 * behind · done) → the five-value status scale. on_track and done both read
 * healthy; not_started and anything unknown read neutral. This is the single
 * mapping the Strategy surface uses so a status color always means one thing.
 */
export function planHealthToStatus(health: string | null): Status {
  switch (health) {
    case "behind":
      return "critical";
    case "at_risk":
      return "watch";
    case "on_track":
    case "done":
      return "healthy";
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
// Retuned to the Visual System V3 palette. These are DOTS (a 6px fill), never
// text, so they are judged as non-text contrast against the workspace.
export const CATEGORY_DOT: Record<string, string> = {
  fundraising: "#C96B38", // terracotta — = --accent
  program: "#32745B", // green — = --success
  product: "#5B6BB5", // indigo
  finance: "#A96820", // amber — = --warning
  operations: "#8A5A12", // deep amber
  compliance: "#C24B40", // red — = --danger
  board: "#7A5BA8", // purple
  recruitment: "#2F7D8A", // teal
  admin: "#746C63", // = --text-secondary
  other: "#756C5B", // = --text-tertiary
};

export function categoryDot(category: string): string {
  return CATEGORY_DOT[category] ?? CATEGORY_DOT.other;
}
