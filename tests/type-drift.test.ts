import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Type-drift gate (specs/bloomos-typography.md D6): the canonical type scale
// lives in lib/admin/typeScale.ts and is never retyped inline in app/admin.
// Each fingerprint below is distinctive to exactly one TYPE role, so any
// occurrence in an admin component is a retype of that role. New code adopts
// the role (import TYPE, or use PageHeader / SectionHeading / StatCard); a
// call site that genuinely can't (different size on a deliberate surface,
// layout change required) gets an ALLOWLIST entry with a one-line reason.
// The gate also fails on stale entries, so the allowlist can only shrink
// honestly.

const SCAN_ROOT = join(process.cwd(), "app", "admin");

// Substring fingerprints — unique to one role each.
const FINGERPRINTS: { pattern: string; role: string }[] = [
  { pattern: "tracking-[0.14em]", role: "TYPE.sectionHeader" },
  { pattern: "tracking-[0.12em]", role: "TYPE.cardLabel" },
  { pattern: "tracking-[0.25em]", role: "TYPE.eyebrow" },
  { pattern: "text-[28px]", role: "TYPE.cardMetric" },
  {
    pattern: "font-display font-black uppercase tracking-tight",
    role: "TYPE.displayTitle / TYPE.displayTitleLg",
  },
];

// Token fingerprint: a single className literal combining these three tokens
// is a retype of TYPE.pageTitle regardless of token order.
const PAGE_TITLE_TOKENS = ["font-heading", "font-bold", "text-2xl"];

// file (repo-relative) + fingerprint pattern -> why this site keeps its own
// treatment instead of adopting the role.
const ALLOWLIST: { file: string; pattern: string; reason: string }[] = [
  // -- sectionHeader fingerprint (tracking-[0.14em]) --
  { file: "app/admin/strategic-plan/narrative/_components/Presenter.tsx", pattern: "tracking-[0.14em]", reason: "12px unweighted keyboard-hint label in the presenter chrome; no role at this size" },
  { file: "app/admin/ops/my-week/page.tsx", pattern: "tracking-[0.14em]", reason: "10px tab kicker with state-dependent color in the my-week tab bar" },
  { file: "app/admin/_components/overview/MyWeekCard.tsx", pattern: "tracking-[0.14em]", reason: "10px kicker at cream/40 on the dark my-week card" },
  { file: "app/admin/_components/rail/RailAgenda.tsx", pattern: "tracking-[0.14em]", reason: "rail chrome's deliberate 10px warm-taupe label voice on dark (PR #218)" },
  { file: "app/admin/_components/rail/RailShell.tsx", pattern: "tracking-[0.14em]", reason: "rail chrome's deliberate 10px warm-taupe label voice on dark (PR #218)" },
  { file: "app/admin/_components/rail/WeekPulse.tsx", pattern: "tracking-[0.14em]", reason: "rail chrome's deliberate 10px warm-taupe label voice on dark (PR #218)" },
  { file: "app/admin/_components/rail/NeedsYouShelf.tsx", pattern: "tracking-[0.14em]", reason: "rail chrome's deliberate 10px warm-taupe label voice on dark (PR #218)" },
  { file: "app/admin/_components/Sidebar.tsx", pattern: "tracking-[0.14em]", reason: "sidebar section labels use the rail's 10px warm-taupe voice on navy" },
  { file: "app/admin/_components/search/EntityProfile.tsx", pattern: "tracking-[0.14em]", reason: "10px dense group label inside the search dropdown" },
  { file: "app/admin/_components/search/GlobalSearch.tsx", pattern: "tracking-[0.14em]", reason: "10px dense group label inside the search dropdown" },
  // -- cardLabel fingerprint (tracking-[0.12em]) --
  { file: "app/admin/strategic-plan/narrative/_components/MovementPlan.tsx", pattern: "tracking-[0.12em]", reason: "11px unweighted owner tag; adopting cardLabel would add heading weight" },
  { file: "app/admin/_components/StageBoard.tsx", pattern: "tracking-[0.12em]", reason: "10px board column label; candidate future columnLabel role" },
  { file: "app/admin/_components/Pipeline.tsx", pattern: "tracking-[0.12em]", reason: "10px pipeline stage label; candidate future columnLabel role" },
  { file: "app/admin/fundraising/grants/_components/GrantsBoard.tsx", pattern: "tracking-[0.12em]", reason: "10px board column label; candidate future columnLabel role" },
  { file: "app/admin/partners/_components/PartnersBoard.tsx", pattern: "tracking-[0.12em]", reason: "10px board column label; candidate future columnLabel role" },
  { file: "app/admin/meetings/_ui.tsx", pattern: "tracking-[0.12em]", reason: "meetings' own 12px/ink-2 SectionLabel component; convergence onto sectionHeader is a visual change deferred past v1" },
  { file: "app/admin/messages/_components/MessagesView.tsx", pattern: "tracking-[0.12em]", reason: "10px thread group label in the messages list" },
  // -- display voice fingerprint --
  { file: "app/admin/ops/projects/[id]/_components/ProjectHeader.tsx", pattern: "font-display font-black uppercase tracking-tight", reason: "editable in-place title at 2xl/3xl; the input twin must match the h1 exactly" },
  { file: "app/admin/ops/my-week/page.tsx", pattern: "font-display font-black uppercase tracking-tight", reason: "3xl tab titles with state-dependent color, smaller than displayTitle" },
  { file: "app/admin/_components/Sidebar.tsx", pattern: "font-display font-black uppercase tracking-tight", reason: "text-base collapsed-sidebar brand mark, not a page title" },
  // -- pageTitle token fingerprint --
  { file: "app/admin/_components/Greeting.tsx", pattern: "pageTitle-tokens", reason: "command-center hero greeting with a responsive sm:text-3xl step pageTitle doesn't have" },
  { file: "app/admin/_components/overview/FollowThroughWidget.tsx", pattern: "pageTitle-tokens", reason: "2xl widget metric with tone color; cardMetric is 28px" },
  { file: "app/admin/_components/overview/GoalForecastWidget.tsx", pattern: "pageTitle-tokens", reason: "2xl widget metric; cardMetric is 28px" },
];

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...tsxFiles(p));
    else if (e.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

// className literals: className="..." and className={`...`} (may span lines).
const CLASSNAME_RE = /className=(?:"([^"]*)"|\{`([^`]*)`\})/gs;

function hasPageTitleTokens(source: string): boolean {
  for (const m of source.matchAll(CLASSNAME_RE)) {
    const tokens = new Set((m[1] ?? m[2] ?? "").split(/\s+/));
    if (PAGE_TITLE_TOKENS.every((t) => tokens.has(t))) return true;
  }
  return false;
}

describe("type-drift gate (specs/bloomos-typography.md D6)", () => {
  const files = tsxFiles(SCAN_ROOT);
  const violations: { file: string; pattern: string; role: string }[] = [];

  for (const abs of files) {
    const rel = abs.slice(process.cwd().length + 1);
    const src = readFileSync(abs, "utf8");
    for (const { pattern, role } of FINGERPRINTS) {
      if (src.includes(pattern)) violations.push({ file: rel, pattern, role });
    }
    if (hasPageTitleTokens(src)) {
      violations.push({ file: rel, pattern: "pageTitle-tokens", role: "TYPE.pageTitle" });
    }
  }

  test("no type-scale retypes in app/admin outside the allowlist", () => {
    const allowed = new Set(ALLOWLIST.map((a) => `${a.file}|${a.pattern}`));
    const offenders = violations.filter((v) => !allowed.has(`${v.file}|${v.pattern}`));
    expect(
      offenders.map((v) => `${v.file}: "${v.pattern}" retypes ${v.role}`),
      "Inline type-scale retype found. Adopt the role (import TYPE from lib/admin/typeScale, or use PageHeader / SectionHeading / StatCard); if this surface genuinely can't, add an ALLOWLIST entry with a one-line reason.",
    ).toEqual([]);
  });

  test("no stale allowlist entries", () => {
    const live = new Set(violations.map((v) => `${v.file}|${v.pattern}`));
    const stale = ALLOWLIST.filter((a) => !live.has(`${a.file}|${a.pattern}`));
    expect(
      stale.map((a) => `${a.file} (${a.pattern})`),
      "Allowlist entry no longer matches anything - remove it so the list only shrinks honestly.",
    ).toEqual([]);
  });
});
