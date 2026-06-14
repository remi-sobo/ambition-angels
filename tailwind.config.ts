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
        ink: "rgb(var(--c-ink) / <alpha-value>)",
        // Raised-surface dark for cards on ink backgrounds (public site).
        "ink-soft": "#1A1A1A",
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
    },
  },
  plugins: [],
};
export default config;
