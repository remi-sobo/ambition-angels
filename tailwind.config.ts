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
          // Every step clears WCAG AA (4.5:1) as small text on app/surface/
          // tile — the contrast gate in tests/design-tokens.test.ts enforces
          // it, so a value here can't quietly slide below the floor again.
          1: "#2A201A", // primary ink (13.88 on app)
          2: "#6B5C4E", // secondary (5.61 on app)
          3: "#796A5C", // tertiary / uppercase labels — the LIGHTEST value ≥4.5 on app (4.55; Quality Floor Q4, was #9A8B7C at 2.88)
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
          // Lightest green ≥4.5 as small text on app/surface/tile AND on its
          // own pale bg (the success-toast pair; Q4, was #2F7D5B at 4.36/app).
          DEFAULT: "#2D7857", // revenue green (4.66 on app, 4.50 on revenue-bg)
          bg: "#E2EFE5", // pale revenue background
        },
        expense: {
          // Same rule for the red (the error-toast pair sat at 4.31 on
          // expense-bg; Q4, was #B5482F).
          DEFAULT: "#B0462E", // expense / overdue red (4.87 on app, 4.50 on expense-bg)
          bg: "#F6E3DC", // pale expense background
        },
        // ── BloomOS five-value status scale (spec Phase 0, AA-verified) ─────
        // One meaning per color, shared by chips (Phase 3) and the briefing
        // engine (Phase 4). `*` is the saturated hue (fills/dots/borders);
        // `*-text` meets WCAG AA as small text on cream; `*-bg` is the pale
        // chip tint (ink-1 label reads AAA on every tint). Nothing outside
        // this scale gets a status color — otherwise it is `neutral`.
        status: {
          critical: "#B0462E", // = expense (4.87 AA on app — safe as text too)
          "critical-text": "#9E3A24", // 5.94 on app, 5.49 on critical-bg
          "critical-bg": "#F6E3DC",
          watch: "#B5762A", // fill/border/dot only (3.28 on app)
          "watch-text": "#8A5A12", // 5.16 on app, 4.87 on watch-bg
          "watch-bg": "#F4E8D0",
          due: "#C0703C", // clay — fill/border/dot only (3.26 on app)
          "due-text": "#96582F", // Q4: due finally gets its text step (4.91 on app, 4.51 on due-bg)
          "due-bg": "#F6E3D2",
          healthy: "#2D7857", // = revenue (4.66 AA on app)
          "healthy-text": "#2D7857", // Q4: the calendar already used this class; now it exists
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
