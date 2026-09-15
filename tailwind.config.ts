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
          // Text-on-cream ramp for the BloomOS product (V3 §3). Plain hexes —
          // admin-only, never consumed by the public site. Every step clears
          // WCAG AA (4.5:1) as small text on app/surface/tile; the contrast
          // gate in tests/design-tokens.test.ts enforces it, so a value here
          // can't quietly slide below the floor again.
          1: "#29241F", // --text-primary   (14.00 on app)
          2: "#746C63", // --text-secondary (4.70 on app)
          3: "#756C5B", // --text-tertiary  (4.72 on app; V3 §13-tuned from #948A7E)
        },
        // Raised-surface dark for cards on ink backgrounds (public site).
        "ink-soft": "#1A1A1A",
        // ── BloomOS V3 surfaces / borders (admin-only) ─────────────────────
        app: "#F7F4EE", // --bg-app       workspace background
        surface: "#FFFDF9", // --bg-surface   card / panel surface
        tile: "#FBF8F2", // --bg-tile      recessed tile (inputs, stat wells)
        hairline: "#E3D9CB", // --border-subtle internal dividers, chart axes
        outline: "#CDBEAA", // --border-strong selected / editable / attention
        // ── The one tenant-ownable accent (V3 §10) ─────────────────────────
        // `accent` is the VIVID terracotta and is fill-only: indicators,
        // underlines, dots, chart marks. Small text and white-on-fill use
        // `accent-ink` (= Tailwind `orange`), which clears AA both ways.
        accent: {
          DEFAULT: "rgb(var(--c-accent) / <alpha-value>)",
          ink: "rgb(var(--c-orange) / <alpha-value>)",
          hover: "rgb(var(--c-orange-dark) / <alpha-value>)",
          soft: "rgb(var(--c-orange-light) / <alpha-value>)",
        },
        revenue: {
          DEFAULT: "#32745B", // --success (5.05 on app, 5.55 under white)
          bg: "#E2EFE8", // --success-soft
        },
        expense: {
          DEFAULT: "#AE4339", // --danger-text (5.22 on app)
          bg: "#F5E2E0", // --danger-soft
        },
        // ── BloomOS five-value status scale (V3 §3, AA-verified) ───────────
        // One meaning per color, shared by badges and the briefing engine.
        // `*` is the saturated hue (fills/dots/borders); `*-text` clears WCAG
        // AA as small text on cream AND on its own pale tint; `*-bg` is the
        // chip tint. Nothing outside this scale gets a status color.
        status: {
          critical: "#C24B40", // --danger      fill (4.80 under white)
          "critical-text": "#AE4339", // 5.22 on app, 4.60 on critical-bg
          "critical-bg": "#F5E2E0",
          watch: "#A96820", // --warning     fill (4.48 under white)
          "watch-text": "#965C1C", // 4.98 on app, 4.58 on watch-bg
          "watch-bg": "#F5EAD6",
          due: "#C96B38", // --accent      fill
          "due-text": "#9D532C", // 5.16 on app, 4.62 on due-bg
          "due-bg": "#F5E5DB",
          healthy: "#32745B", // --success
          "healthy-text": "#32745B", // 5.05 on app, 4.69 on healthy-bg
          "healthy-bg": "#E2EFE8",
          neutral: "#746C63", // = ink-2
          "neutral-bg": "#FBF8F2", // = tile
        },
        // Deliberate dark "attention" surface. Reserved for the briefing
        // engine's critical state. Distinct from the sidebar chrome (`navy`).
        attention: {
          DEFAULT: "#241C15",
          fg: "#F3EDE4",
        },
        // Espresso navigation chrome (V3 §7). `navy` is the historical token
        // name; the value is --bg-sidebar.
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
        // BloomOS V3 §8 — the product workspace. Was a 1100px column that left
        // a wide dead gutter on desktop; `workspace` is the default page
        // width, `reading` keeps long-form/one-column screens legible.
        workspace: "1280px",
        reading: "900px",
      },
      borderRadius: {
        // Public Ambition Angels site — deliberately unchanged.
        card: "1.25rem",
        "card-lg": "1.75rem",
        // ── BloomOS V3 §4 shape language (admin-only) ────────────────────
        // Three steps, one meaning each. Nothing in the product invents a
        // fourth, and `rounded-full` is reserved for badges/dots/avatars.
        control: "9px", // buttons, inputs, selects, small controls
        panel: "14px", // cards, list containers
        "panel-lg": "16px", // large feature panels
        modal: "18px", // modals, sheets
      },
      boxShadow: {
        // BloomOS V3 §12 — "BloomOS should not be a shadow-heavy product."
        // Cards read through surface contrast + a hairline border, so the two
        // historical card-elevation tokens resolve to nothing. Real elevation
        // (modals, dropdowns, floating menus) uses the `.elevate-menu` /
        // `.elevate-modal` utilities in globals.css instead.
        panel: "none",
        tile: "none",
      },
    },
  },
  plugins: [],
};
export default config;
