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
        orange: {
          DEFAULT: "#E8500A",
          dark: "#B83D06",
          light: "#FFF0EA",
          mid: "#F47840",
        },
        ink: "#0E0E0E",
        charcoal: "#3D3D3D",
        "gray-warm": "#6B6960",
        "gray-mid": "#C8C6BE",
        "gray-light": "#F0EEE8",
        cream: "#FAFAF8",
      },
      fontFamily: {
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
