/**
 * Chart color tokens for BloomOS — Visual System V3 §3, §10, §11.
 *
 * SVG `fill` / `stroke` cannot take a Tailwind class, so charts were the one
 * place in the product that legitimately needed raw hex values — and, being
 * outside the token system, they quietly kept the PREVIOUS palette after every
 * refresh (#C0703C accents, #2D7857 greens, #E7DCC9 axes). That made the
 * finance charts the only surface still painted in the old colors.
 *
 * This module is the single source those files import from. It mirrors the
 * `.admin-shell` custom properties in app/globals.css exactly; changing a
 * token there means changing it here, and tests/design-tokens.test.ts pins the
 * pair together so they cannot drift again.
 *
 * Marks (bars, lines, dots, swatches) are judged as non-text contrast, so they
 * use the vivid fills; anything that renders a NUMBER or a LABEL inside a chart
 * uses the `*Text` steps, which clear WCAG AA on the workspace.
 */
export const CHART = {
  /** Series marks. */
  accent: "#C96B38", // --accent
  revenue: "#32745B", // --success
  expense: "#C24B40", // --danger
  warning: "#A96820", // --warning

  /** Ink used for value labels, axis labels and data dots. */
  ink: "#29241F", // --text-primary
  inkMuted: "#746C63", // --text-secondary
  inkFaint: "#756C5B", // --text-tertiary

  /** Structure: axes, gridlines, progress tracks. */
  axis: "#E3D9CB", // --border-subtle
  track: "#E3D9CB", // --border-subtle
  border: "#CDBEAA", // --border-strong

  /** Surfaces, for chart backgrounds and label plates. */
  surface: "#FFFDF9", // --bg-surface
  tile: "#FBF8F2", // --bg-tile
} as const;

/**
 * The categorical ramp, for charts that must distinguish more series than the
 * semantic scale covers (channel mixes, category splits).
 *
 * V3 §14 says not to introduce dozens of colors, so this is deliberately short
 * and warm-biased: the accent leads, the semantic hues follow, and only then do
 * two off-family hues appear. Ordered by distinguishability, so a two-series
 * chart gets the two most separable values.
 */
export const CHART_SERIES = [
  CHART.accent,
  CHART.revenue,
  CHART.warning,
  CHART.expense,
  "#5B6BB5", // indigo — matches CATEGORY_DOT.product
  "#2F7D8A", // teal   — matches CATEGORY_DOT.recruitment
  "#7A5BA8", // purple — matches CATEGORY_DOT.board
] as const;
