/**
 * Board portal design tokens (spec §2, as built in Board Portal.dc.html).
 *
 * Inline hexes rather than Tailwind classes throughout the portal: the shared
 * `orange`/`ink`/`cream` Tailwind tokens are CSS-var-backed and get re-themed
 * inside `.admin-shell`, so a governance surface that must look identical
 * everywhere is safer pinned to literals. These are those literals in one
 * place so a change is one edit.
 *
 * Where the spec and the design export disagreed, the design won on anything
 * visual: card radius is 12px here, not the spec's 8px, and buttons are pills.
 */
export const C = {
  orange: "#E8500A",
  orangeDark: "#B83D06",
  ink: "#0E0E0E",
  charcoal: "#3D3D3D",
  muted: "#6B6960",
  rule: "#E4E2DC",
  ruleStrong: "#C8C6BE",
  cream: "#FAFAF8",
  white: "#FFFFFF",
  grayLight: "#F0EEE8",
} as const;

export const F = {
  display: "'Big Shoulders Display',sans-serif",
  heading: "'Poppins',sans-serif",
  body: "'DM Sans',sans-serif",
} as const;

/** Card surface: 1px rule, no shadow, 12px radius. */
export const card: React.CSSProperties = {
  background: C.white,
  border: `1px solid ${C.rule}`,
  borderRadius: 12,
};

/** 13px letterspaced uppercase label used as an eyebrow everywhere. */
export const eyebrow: React.CSSProperties = {
  fontFamily: F.heading,
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: C.muted,
};
