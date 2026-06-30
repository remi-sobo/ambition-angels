// Shared vocabulary + editable-field list for strategy_angles, used by the
// create (POST), edit (PATCH), and Reed-draft routes so they validate the same
// way. The framing columns (frame/lead/tone/funds_label/catch_*/flag) were
// added in extend_strategy_angles_framing.sql.

export const ANGLE_BADGES = [
  "north-star",
  "proven",
  "building",
  "reframed",
  "productizing",
  "core-thesis",
  "new",
  "emerging-stub",
] as const;

export const ANGLE_TONES = ["primary", "soft", "neutral"] as const;

// Free-text columns an admin (or Reed) can write, beyond name/status_badge/tone.
export const ANGLE_TEXT_FIELDS = [
  "hook",
  "funds",
  "want",
  "ask",
  "approach",
  "nav_title",
  "frame",
  "lead",
  "funds_label",
  "catch_label",
  "catch_body",
  "flag",
] as const;

export type AngleTextField = (typeof ANGLE_TEXT_FIELDS)[number];

// Longer columns get a bigger cap; the rest are short single-liners.
const LONG_FIELDS = new Set<AngleTextField>(["frame", "catch_body", "funds", "want", "approach"]);
export const angleFieldMax = (f: AngleTextField): number => (LONG_FIELDS.has(f) ? 4000 : 600);

export const slugifyAngle = (s: string): string =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

/** Trim to null, capping length. */
export const angleStr = (v: unknown, max = 600): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
