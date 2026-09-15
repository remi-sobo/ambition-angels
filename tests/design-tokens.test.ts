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
  // :root — the public Ambition Angels brand (untouched by Visual System V3).
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
  "--c-accent: 232 80 10;",
  // .admin-shell — the BloomOS Visual System V3 semantic layer.
  "--bg-app: #F7F4EE;",
  "--bg-surface: #FFFDF9;",
  "--bg-tile: #FBF8F2;",
  "--bg-sidebar: #1C1814;",
  "--bg-sidebar-raised: #2A241E;",
  "--text-primary: #29241F;",
  "--text-secondary: #746C63;",
  "--text-tertiary: #756C5B;",
  "--sidebar-text: #F3EDE4;",
  "--sidebar-muted: #A89B8D;",
  "--border-subtle: #E3D9CB;",
  "--border-strong: #CDBEAA;",
  "--accent: #C96B38;",
  "--accent-ink: #9D532C;",
  "--accent-hover: #7D4223;",
  "--accent-mid: #8D4B27;",
  "--accent-soft: #F5E5DB;",
  "--success: #32745B;",
  "--success-soft: #E2EFE8;",
  "--warning: #A96820;",
  "--warning-text: #965C1C;",
  "--warning-soft: #F5EAD6;",
  "--danger: #C24B40;",
  "--danger-text: #AE4339;",
  "--danger-soft: #F5E2E0;",
  "--radius-control: 9px;",
  "--radius-card: 15px;",
  "--radius-modal: 18px;",
  "--c-accent: 201 107 56;",
  "--c-orange: 157 83 44;",
  "--c-orange-dark: 125 66 35;",
  "--c-orange-light: 245 229 219;",
  "--c-orange-mid: 141 75 39;",
  "--c-ink: 247 244 238;",
  "--c-cream: 243 237 228;",
  "--c-navy: 28 24 20;",
  "--c-navy-light: 42 36 30;",
  "--orange: #9d532c;",
  "--font-display: var(--font-instrument);",
  "--font-heading: var(--font-instrument);",
  "--font-body: var(--font-instrument);",
];

// The one canonical type scale (lib/admin/typeScale.ts, specs/bloomos-typography.md §2).
// Muted-small roles sit on the Quality Floor Q4 12px minimum (text-xs).
const FROZEN_TYPE_SCALE = {
  pageTitle:
    "font-heading font-semibold text-[28px] leading-tight tracking-[-0.02em] text-ink-1",
  sectionTitle:
    "font-heading font-semibold text-xl leading-snug tracking-[-0.01em] text-ink-1",
  subsectionTitle: "font-heading font-semibold text-[17px] leading-snug text-ink-1",
  sectionHeader:
    "font-heading font-semibold text-xs uppercase tracking-[0.06em] text-ink-2",
  cardTitle: "font-heading font-semibold text-[15px] leading-snug text-ink-1",
  modalTitle: "font-heading font-semibold text-lg leading-snug text-ink-1",
  cardMetric:
    "font-heading font-semibold text-[28px] leading-none tracking-[-0.02em] tabular-nums text-ink-1",
  cardLabel: "text-xs font-medium text-ink-2",
  body: "text-sm text-ink-1",
  bodyMuted: "text-sm text-ink-2",
  metadata: "text-xs text-ink-2",
  nav: "text-sm font-medium",
  button: "text-[13px] font-semibold",
  badge: "text-xs font-semibold",
  tableHeader: "text-xs font-semibold uppercase tracking-[0.06em] text-ink-2",
  fieldLabel: "text-xs font-medium text-ink-1",
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
  app: ["#F7F4EE", 'app: "#F7F4EE"'],
  surface: ["#FFFDF9", 'surface: "#FFFDF9"'],
  tile: ["#FBF8F2", 'tile: "#FBF8F2"'],
} as const;

// Visual System V3 §13 vs §3. The spec's literal values for the accent
// (#C96B38 → 3.39 on app), warning (#A96820 → 4.08), danger (#C24B40 → 4.37)
// and tertiary text (#948A7E → 3.09) all fall UNDER the AA floor as small
// text. §3 allows tuning, §13 requires the contrast, so each hue keeps its
// vivid value as a FILL and gains a deepened step for type. Only the type
// steps are gated here; the fill-only values (accent, status.watch,
// status.due, status.critical) are asserted separately below as non-text.
const TEXT_TOKENS = {
  "ink-1": ["#29241F", '1: "#29241F"'],
  "ink-2": ["#746C63", '2: "#746C63"'],
  "ink-3": ["#756C5B", '3: "#756C5B"'],
  orange: ["#9D532C", "--c-orange: 157 83 44;"],
  "orange-dark": ["#7D4223", "--c-orange-dark: 125 66 35;"],
  "orange-mid": ["#8D4B27", "--c-orange-mid: 141 75 39;"],
  revenue: ["#32745B", 'DEFAULT: "#32745B"'],
  expense: ["#AE4339", 'DEFAULT: "#AE4339"'],
  "status.critical-text": ["#AE4339", '"critical-text": "#AE4339"'],
  "status.watch-text": ["#965C1C", '"watch-text": "#965C1C"'],
  "status.due-text": ["#9D532C", '"due-text": "#9D532C"'],
  "status.healthy-text": ["#32745B", '"healthy-text": "#32745B"'],
  "status.neutral": ["#746C63", 'neutral: "#746C63"'],
} as const;

// Fill-only tokens: they carry meaning as a dot/bar/indicator, never behind
// small text. WCAG 1.4.11 sets 3:1 for such non-text UI components.
const FILL_TOKENS: Array<[string, string, string]> = [
  ["accent", "#C96B38", "--accent: #C96B38;"],
  ["status.critical", "#C24B40", 'critical: "#C24B40"'],
  ["status.watch", "#A96820", 'watch: "#A96820"'],
  ["status.due", "#C96B38", 'due: "#C96B38"'],
  ["status.healthy", "#32745B", 'healthy: "#32745B"'],
];

// A fill that DOES sit under a white label (primary button, active stepper
// node, count badge) has to clear 4.5:1 against white as well.
const WHITE_LABEL_FILLS: Array<[string, string]> = [
  ["orange", "#9D532C"],
  ["orange-dark", "#7D4223"],
  ["revenue", "#32745B"],
  ["status.critical", "#C24B40"],
];

// The chip/toast pairs: a text step must also clear 4.5:1 on its own pale
// bg. The fourth column is the literal declaration line pinned in config.
const PAIRS: Array<[keyof typeof TEXT_TOKENS, string, string, string]> = [
  ["revenue", "revenue-bg", "#E2EFE8", 'bg: "#E2EFE8"'],
  ["expense", "expense-bg", "#F5E2E0", 'bg: "#F5E2E0"'],
  ["status.critical-text", "critical-bg", "#F5E2E0", '"critical-bg": "#F5E2E0"'],
  ["status.watch-text", "watch-bg", "#F5EAD6", '"watch-bg": "#F5EAD6"'],
  ["status.due-text", "due-bg", "#F5E5DB", '"due-bg": "#F5E5DB"'],
  ["status.healthy-text", "healthy-bg", "#E2EFE8", '"healthy-bg": "#E2EFE8"'],
];

describe("Q4 contrast gate (DoD 5): text tokens ≥ 4.5:1 on every admin background", () => {
  test("the frozen hexes are the shipped hexes (config pin)", () => {
    // A token now lives in one of two places: a plain hex in
    // tailwind.config.ts, or a custom property / channel triple in
    // globals.css. Either source pins it.
    const SOURCES = TAILWIND + readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
    for (const [hex, decl] of [...Object.values(BACKGROUNDS), ...Object.values(TEXT_TOKENS)]) {
      expect(SOURCES, `${decl} missing from tailwind.config.ts / globals.css`).toContain(decl);
      // Channel-triple declarations pin the value by rgb(), not by hex.
      if (decl.includes("#")) expect(decl).toContain(hex);
    }
    for (const [name, hex, decl] of FILL_TOKENS) {
      expect(SOURCES, `${name}: ${decl} missing`).toContain(decl);
      if (decl.includes("#")) expect(decl).toContain(hex);
    }
  });

  test("fill-only tokens clear the 3:1 non-text floor (WCAG 1.4.11)", () => {
    for (const [name, hex] of FILL_TOKENS) {
      for (const [bgName, [bg]] of Object.entries(BACKGROUNDS)) {
        const r = contrast(hex, bg);
        expect(r, `${name} (${hex}) on ${bgName} (${bg}) = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  test("fills that carry a white label clear AA against white", () => {
    // Visual System V3 §4 puts a white label on the primary button and the
    // active stepper node. The vivid --accent (#C96B38) is only 3.72 under
    // white, which is why those surfaces use --accent-ink instead.
    for (const [name, hex] of WHITE_LABEL_FILLS) {
      const r = contrast("#FFFFFF", hex);
      expect(r, `white on ${name} (${hex}) = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
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
