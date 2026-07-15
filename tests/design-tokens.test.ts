import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
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
const FROZEN_TYPE_SCALE = {
  pageTitle: "font-heading font-bold text-2xl text-ink-1",
  sectionHeader: "font-heading font-semibold text-[11px] uppercase tracking-[0.14em] text-ink-3",
  sectionTitle: "font-heading font-bold text-lg text-ink-1",
  cardTitle: "font-heading font-bold text-sm text-ink-1",
  modalTitle: "font-heading font-bold text-lg text-ink-1",
  cardMetric: "font-heading font-semibold text-[28px] leading-none tracking-tight tabular-nums text-ink-1",
  cardLabel: "text-[11px] font-heading font-semibold uppercase tracking-[0.12em] text-ink-3",
  body: "text-sm text-ink-1",
  bodyMuted: "text-sm text-ink-2",
  metadata: "text-[11px] text-ink-2",
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
