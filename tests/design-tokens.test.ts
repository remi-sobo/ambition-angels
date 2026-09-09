import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { TYPE } from "@/lib/admin/typeScale";

// Config-integrity gate (Sobo playbook, Esface A6): freeze the design tokens so
// the source of truth (app/globals.css + lib/admin/typeScale.ts) cannot drift
// from docs/bloomos/06-design-system.md silently. A token change is fine — it
// just has to be DELIBERATE: update the frozen values below in the same commit,
// which makes the change reviewable in the diff.

// Every `--name: value;` custom property declared in globals.css, in order,
// normalized (comments stripped, whitespace collapsed). Includes the :root
// brand + channel tokens and the .admin-shell overrides.
const FROZEN_CSS_TOKENS = [
  "--orange: #E8500A;",
  "--orange-dark: #B83D06;",
  "--orange-light: #FFF0EA;",
  "--orange-mid: #F47840;",
  "--ink: #0E0E0E;",
  "--charcoal: #3D3D3D;",
  "--gray-warm: #6B6960;",
  "--gray-mid: #C8C6BE;",
  "--gray-light: #F0EEE8;",
  "--cream: #FAFAF8;",
  "--c-orange: 232 80 10;",
  "--c-orange-dark: 184 61 6;",
  "--c-orange-light: 255 240 234;",
  "--c-orange-mid: 244 120 64;",
  "--c-ink: 14 14 14;",
  "--c-cream: 250 250 248;",
  "--c-navy: 16 33 75;",
  "--c-navy-light: 26 47 99;",
  "--c-orange: 192 112 60;",
  "--c-orange-dark: 168 94 48;",
  "--c-orange-light: 243 230 221;",
  "--c-orange-mid: 206 144 112;",
  "--c-ink: 245 239 226;",
  "--c-cream: 240 239 226;",
  "--c-navy: 31 24 17;",
  "--c-navy-light: 45 33 23;",
  "--orange: #c0703c;",
  "--font-display: var(--font-grotesk);",
  "--font-heading: var(--font-grotesk);",
];

// The one canonical type scale (lib/admin/typeScale.ts, specs/bloomos-typography.md §2).
// Muted-small roles sit on the Quality Floor Q4 12px minimum (text-xs).
const FROZEN_TYPE_SCALE = {
  pageTitle: "font-heading font-bold text-2xl text-ink-1",
  sectionHeader: "font-heading font-semibold text-xs uppercase tracking-[0.14em] text-ink-3",
  sectionTitle: "font-heading font-bold text-lg text-ink-1",
  cardTitle: "font-heading font-bold text-sm text-ink-1",
  modalTitle: "font-heading font-bold text-lg text-ink-1",
  cardMetric: "font-heading font-semibold text-[28px] leading-none tracking-tight tabular-nums text-ink-1",
  cardLabel: "text-xs font-heading font-semibold uppercase tracking-[0.12em] text-ink-3",
  body: "text-sm text-ink-1",
  bodyMuted: "text-sm text-ink-2",
  metadata: "text-xs text-ink-2",
};

function extractCssTokens(css: string): string[] {
  return (css.match(/--[\w-]+:\s*[^;{}]+;/g) ?? []).map((d) =>
    d.replace(/\/\*.*?\*\//g, "").replace(/\s+/g, " ").trim(),
  );
}

describe("design-token freeze (config-integrity gate)", () => {
  test("globals.css custom properties match the frozen set", () => {
    const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
    expect(
      extractCssTokens(css),
      "Design tokens in app/globals.css changed. If intentional, update FROZEN_CSS_TOKENS here and docs/bloomos/06-design-system.md in the same commit.",
    ).toEqual(FROZEN_CSS_TOKENS);
  });

  test("the type scale matches the frozen set", () => {
    expect(
      TYPE,
      "The type scale in lib/admin/typeScale.ts changed. If intentional, update FROZEN_TYPE_SCALE here and docs/bloomos/06-design-system.md in the same commit.",
    ).toEqual(FROZEN_TYPE_SCALE);
  });
});

// ── Quality Floor Q4 — the contrast gate ────────────────────────────────────
// The audit's F3: ink-3 (#9A8B7C) shipped at 2.88:1 on the app background,
// codified by the scale itself, and the rebuild GREW its use because new
// screens followed house style. This gate makes that impossible to repeat:
// the ratios are COMPUTED here from the values in tailwind.config.ts, so
// reverting ink-3 (or nudging any text token below 4.5:1) fails the build.
// Saturated fill/border/dot tokens (status.watch, status.due, the brand
// orange) are deliberately not text tokens and stay out of the gate; their
// text companions (-text steps, orange-dark) are in it.

const TAILWIND = readFileSync(join(process.cwd(), "tailwind.config.ts"), "utf8");

function relLum(hex: string): number {
  const c = (i: number) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * c(0) + 0.7152 * c(1) + 0.0722 * c(2);
}

function contrast(fg: string, bg: string): number {
  const a = relLum(fg);
  const b = relLum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// Frozen hexes, each pinned to its declaration line in tailwind.config.ts —
// the config can't change without this test changing, and this test can't
// carry a failing value past the ratio asserts below.
const BACKGROUNDS = {
  app: ["#F5EFE2", 'app: "#F5EFE2"'],
  surface: ["#FFFDF8", 'surface: "#FFFDF8"'],
  tile: ["#FBF6EC", 'tile: "#FBF6EC"'],
} as const;

const TEXT_TOKENS = {
  "ink-1": ["#2A201A", '1: "#2A201A"'],
  "ink-2": ["#6B5C4E", '2: "#6B5C4E"'],
  "ink-3": ["#796A5C", '3: "#796A5C"'],
  revenue: ["#2D7857", 'DEFAULT: "#2D7857"'],
  expense: ["#B0462E", 'DEFAULT: "#B0462E"'],
  "status.critical": ["#B0462E", 'critical: "#B0462E"'],
  "status.critical-text": ["#9E3A24", '"critical-text": "#9E3A24"'],
  "status.watch-text": ["#8A5A12", '"watch-text": "#8A5A12"'],
  "status.due-text": ["#96582F", '"due-text": "#96582F"'],
  "status.healthy": ["#2D7857", 'healthy: "#2D7857"'],
  "status.healthy-text": ["#2D7857", '"healthy-text": "#2D7857"'],
  "status.neutral": ["#6B5C4E", 'neutral: "#6B5C4E"'],
} as const;

// The chip/toast pairs: a text step must also clear 4.5:1 on its own pale
// bg. The fourth column is the literal declaration line pinned in config.
const PAIRS: Array<[keyof typeof TEXT_TOKENS, string, string, string]> = [
  ["revenue", "revenue-bg", "#E2EFE5", 'bg: "#E2EFE5"'],
  ["expense", "expense-bg", "#F6E3DC", 'bg: "#F6E3DC"'],
  ["status.critical-text", "critical-bg", "#F6E3DC", '"critical-bg": "#F6E3DC"'],
  ["status.watch-text", "watch-bg", "#F4E8D0", '"watch-bg": "#F4E8D0"'],
  ["status.due-text", "due-bg", "#F6E3D2", '"due-bg": "#F6E3D2"'],
  ["status.healthy-text", "healthy-bg", "#E2EFE5", '"healthy-bg": "#E2EFE5"'],
];

describe("Q4 contrast gate (DoD 5): text tokens ≥ 4.5:1 on every admin background", () => {
  test("the frozen hexes are the shipped hexes (config pin)", () => {
    for (const [hex, decl] of [...Object.values(BACKGROUNDS), ...Object.values(TEXT_TOKENS)]) {
      expect(TAILWIND, `${decl} missing from tailwind.config.ts`).toContain(decl);
      expect(decl).toContain(hex);
    }
  });

  test("every text token clears WCAG AA small-text on app, surface, AND tile", () => {
    // All type-scale roles render under 18px, so 4.5:1 is the bar everywhere.
    // Reverting ink-3 to #9A8B7C lands at 2.88 on app and fails right here.
    for (const [name, [fg]] of Object.entries(TEXT_TOKENS)) {
      for (const [bgName, [bg]] of Object.entries(BACKGROUNDS)) {
        const r = contrast(fg, bg);
        expect(r, `${name} (${fg}) on ${bgName} (${bg}) = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  test("the toast/chip pairs clear AA on their own pale backgrounds", () => {
    for (const [name, bgName, bg, decl] of PAIRS) {
      const fg = TEXT_TOKENS[name][0];
      const r = contrast(fg, bg);
      expect(r, `${name} (${fg}) on ${bgName} (${bg}) = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      expect(TAILWIND, `${decl} missing from tailwind.config.ts`).toContain(decl);
    }
  });

  test("the type floor holds: no 8px/9px text anywhere in app/admin", () => {
    // The Q4 sweep raised every straggler; this keeps them raised.
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.tsx?$/.test(name)) out.push(p);
      }
      return out;
    };
    for (const f of walk(join(process.cwd(), "app", "admin"))) {
      const s = readFileSync(f, "utf8");
      expect(s, f).not.toMatch(/text-\[[89]px\]/);
      expect(s, f).not.toMatch(/fontSize=\{?"?[89]"?\}?[\s/>]/);
    }
  });
});
