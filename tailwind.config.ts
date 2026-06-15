import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // These four tokens are CSS-var-backed (channel triples) so the
        // BloomOS admin can re-theme them within `.admin-shell` without
        // touching the public Ambition Angels brand. :root holds the public
        // values (see globals.css); `.admin-shell` overrides them to the
        // warm, logo-matched palette. Channel format keeps `/opacity` working.
        orange: {
          DEFAULT: "rgb(var(--c-orange) / <alpha-value>)",
          dark: "rgb(var(--c-orange-dark) / <alpha-value>)",
          light: "rgb(var(--c-orange-light) / <alpha-value>)",
          mid: "rgb(var(--c-orange-mid) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--c-ink) / <alpha-value>)",
          // Text-on-cream ramp for the BloomOS admin (cream workspace).
          // Plain hexes — admin-only, never consumed by the public site.
          1: "#2A201A", // primary ink
          2: "#6B5C4E", // secondary
          3: "#9A8B7C", // tertiary / uppercase labels
        },
        // Raised-surface dark for cards on ink backgrounds (public site).
        "ink-soft": "#1A1A1A",
        // ── BloomOS admin cream-workspace surfaces / data (admin-only) ──────
        // Cream-tuned, fixed values. Only referenced inside app/admin/*, so
        // they never bleed into the public Ambition Angels brand.
        app: "#F5EFE2", // cream workspace background
        surface: "#FFFDF8", // card / panel surface
        tile: "#FBF6EC", // recessed tile (stat cards, inputs)
        hairline: "#E7DCC9", // internal dividers, chart axes, progress tracks
        outline: "#C7B18C", // stronger card outline
        revenue: {
          DEFAULT: "#2F7D5B", // revenue green (deepened for cream)
          bg: "#E2EFE5", // pale revenue background
        },
        expense: {
          DEFAULT: "#B5482F", // expense / overdue red (deepened for cream)
          bg: "#F6E3DC", // pale expense background
        },
        // ── BloomOS five-value status scale (spec Phase 0, AA-verified) ─────
        // One meaning per color, shared by chips (Phase 3) and the briefing
        // engine (Phase 4). `*` is the saturated hue (fills/dots/borders);
        // `*-text` meets WCAG AA as small text on cream; `*-bg` is the pale
        // chip tint (ink-1 label reads AAA on every tint). Nothing outside
        // this scale gets a status color — otherwise it is `neutral`.
        status: {
          critical: "#B5482F",
          "critical-text": "#9E3A24", // 6.70 AA on surface
          "critical-bg": "#F6E3DC",
          watch: "#B5762A",
          "watch-text": "#8A5A12", // 4.87 AA on watch-bg
          "watch-bg": "#F4E8D0",
          due: "#C0703C", // clay — fill/border/dot only (AA-large as text)
          "due-bg": "#F6E3D2",
          healthy: "#2F7D5B", // 4.91 AA on surface
          "healthy-bg": "#E2EFE5",
          neutral: "#6B5C4E", // = ink-2
          "neutral-bg": "#FBF6EC", // = tile
        },
        // Deliberate dark "attention" surface. Reserved for the briefing
        // engine's critical state (Phase 4) — light text on it reads AAA.
        // Distinct from the espresso sidebar chrome (`navy`).
        attention: {
          DEFAULT: "#23160D",
          fg: "#F5EFE2",
        },
        // BloomOS product chrome (docs/bloomos/06-design-system.md §2).
        navy: {
          DEFAULT: "rgb(var(--c-navy) / <alpha-value>)",
          light: "rgb(var(--c-navy-light) / <alpha-value>)",
        },
        charcoal: "#3D3D3D",
        "gray-warm": "#6B6960",
        "gray-mid": "#C8C6BE",
        "gray-light": "#F0EEE8",
        cream: "rgb(var(--c-cream) / <alpha-value>)",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        heading: ["var(--font-heading)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
      },
      maxWidth: {
        site: "1200px",
        prose: "680px",
      },
      borderRadius: {
        card: "1.25rem",
        "card-lg": "1.75rem",
      },
      boxShadow: {
        // BloomOS admin cream-workspace elevation (admin-only).
        panel: "0 1px 3px rgba(60,40,20,.06)",
        tile: "0 1px 2px rgba(60,40,20,.05)",
      },
    },
  },
  plugins: [],
};
export default config;
