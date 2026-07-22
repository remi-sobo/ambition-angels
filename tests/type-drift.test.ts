import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Type-drift gate (specs/bloomos-typography.md §3 phase 4.2 + D5/D6): the
// canonical ten-role scale lives in lib/admin/typeScale.ts and is never
// retyped inline in app/admin. Four checks:
//
//   (a) `font-display font-black` — the retired display voice — appears only
//       in the allow-listed metric/brand tail. The spec's title layer is at
//       zero; the metric tail (big display numbers in finance/ops/analytics)
//       is outside this spec's copy-preserving scope and is enumerated below
//       so it can only shrink. Candidate follow-up: a displayMetric role.
//   (b) every <h1> in app/admin renders through PageHeader or consumes TYPE,
//       except the allow-listed files. (The spec's literal file list plus the
//       two markdown renderers and the editable project title — spec phases
//       2.3/2.4 themselves sanction TYPE.pageTitle h1s, so the check is
//       "consumes the role", not "no h1 anywhere".)
//   (c) the retired literals never reappear inside <h2>/<h3> tags.
//   (d) role fingerprints (tracking values unique to sectionHeader /
//       cardLabel / the PageHeader eyebrow, and cardMetric's text-[28px])
//       appear only in allow-listed files.
//
// Every allowlist is also checked for staleness — an entry whose violation
// no longer exists fails the gate, so the lists only shrink honestly.

const SCAN_ROOT = join(process.cwd(), "app", "admin");

// (a) files still carrying the display-black voice, with why.
const DISPLAY_BLACK_ALLOWLIST: { file: string; reason: string }[] = [
  { file: "app/admin/ops/projects/[id]/_components/ProjectHeader.tsx", reason: "editable in-place project title; the input twin must match the h1 exactly" },
  { file: "app/admin/ops/_components/CategoryCounts.tsx", reason: "display metric (category count)" },
  { file: "app/admin/ops/_components/MondayCommit.tsx", reason: "display metric (commit count)" },
  { file: "app/admin/ops/my-week/page.tsx", reason: "the two door-tile titles, state-colored, smaller than pageTitle" },
  { file: "app/admin/ops/friday/page.tsx", reason: "display metric (close count)" },
  { file: "app/admin/_components/rail/RailAgenda.tsx", reason: "rail clock numeral on dark chrome" },
  { file: "app/admin/_components/LoginScreen.tsx", reason: "D5 exemption: marketing-style dark surface" },
  { file: "app/admin/_components/Sidebar.tsx", reason: "brand marks (BloomOS wordmark, collapsed mark)" },
  { file: "app/admin/AnalyticsView.tsx", reason: "display metrics (orange stat numerals)" },
  { file: "app/admin/finance/model/page.tsx", reason: "display metric (model numerals)" },
  { file: "app/admin/finance/_components/ReconcileCard.tsx", reason: "display metric (computed cash)" },
  { file: "app/admin/finance/_components/charts.tsx", reason: "display metric (chart value + axis label)" },
  { file: "app/admin/finance/_components/RunwayTiers.tsx", reason: "display metric (runway months)" },
  { file: "app/admin/finance/page.tsx", reason: "display metric (dashboard numerals)" },
  { file: "app/admin/finance/budget/_components/BudgetEditor.tsx", reason: "display metric (budget totals)" },
  { file: "app/admin/finance/forecast/_components/ForecastBoard.tsx", reason: "display metrics (scenario values)" },
  { file: "app/admin/meetings/page.tsx", reason: "display metric (coverage-gap numeral)" },
  { file: "app/admin/meetings/_ui.tsx", reason: "display metric (section count numeral)" },
  { file: "app/admin/legacy/page.tsx", reason: "legacy dashboard, display-stat wall" },
];

// (b) files allowed to render an h1 that doesn't consume TYPE.
const H1_ALLOWLIST: { file: string; reason: string }[] = [
  { file: "app/admin/_components/LoginScreen.tsx", reason: "D5 exemption: marketing-style dark surface" },
  { file: "app/admin/strategic-plan/narrative/_components/shared.tsx", reason: "D5 exemption: full-screen presentation deck" },
  { file: "app/admin/strategic-plan/narrative/_components/Presenter.tsx", reason: "D5 exemption: full-screen presentation deck" },
  { file: "app/admin/ops/projects/[id]/_components/ProjectHeader.tsx", reason: "editable in-place title; twin input must match" },
  { file: "app/admin/ops/projects/[id]/_components/ProjectDescription.tsx", reason: "markdown renderer: h1 is rendered document content" },
  { file: "app/admin/fundraising/prospects/[id]/_components/BriefSections/RawResearchNotes.tsx", reason: "markdown renderer: h1 is rendered document content" },
];

// (c) retired literals that must never come back as h2/h3 headings.
const RETIRED_HEADING_LITERALS = [
  "font-heading font-bold text-ink-1 text-sm",
  "text-xs uppercase tracking-wider text-ink-2",
];

// (d) role fingerprints + the files still allowed to carry them inline.
const FINGERPRINTS: { pattern: string; role: string; allow: { file: string; reason: string }[] }[] = [
  {
    pattern: "tracking-[0.14em]",
    role: "TYPE.sectionHeader",
    allow: [
      { file: "app/admin/strategic-plan/narrative/_components/Presenter.tsx", reason: "12px unweighted keyboard-hint label in the deck chrome (D5 surface)" },
      { file: "app/admin/_components/search/EntityProfile.tsx", reason: "10px dense group label inside the search dropdown" },
      { file: "app/admin/_components/search/GlobalSearch.tsx", reason: "10px dense group label inside the search dropdown" },
    ],
  },
  {
    pattern: "tracking-[0.12em]",
    role: "TYPE.cardLabel",
    allow: [
      { file: "app/admin/strategic-plan/narrative/_components/MovementPlan.tsx", reason: "11px unweighted owner tag; cardLabel would add heading weight" },
      { file: "app/admin/_components/StageBoard.tsx", reason: "10px board column label; candidate future columnLabel role" },
      { file: "app/admin/_components/Pipeline.tsx", reason: "10px pipeline stage label; candidate future columnLabel role" },
      { file: "app/admin/fundraising/grants/_components/GrantsBoard.tsx", reason: "10px board column label; candidate future columnLabel role" },
      { file: "app/admin/partners/_components/PartnersBoard.tsx", reason: "10px board column label; candidate future columnLabel role" },
      { file: "app/admin/meetings/_ui.tsx", reason: "meetings' 12px/ink-2 SectionLabel component; convergence deferred past v1" },
      { file: "app/admin/messages/_components/MessagesView.tsx", reason: "10px thread group label in the messages list" },
    ],
  },
  {
    pattern: "tracking-[0.25em]",
    role: "the PageHeader eyebrow slot",
    allow: [
      { file: "app/admin/_components/PageHeader.tsx", reason: "the primitive that defines the eyebrow treatment" },
      { file: "app/admin/_components/FeatureGate.tsx", reason: "standalone module-gate panel eyebrow (no PageHeader on this surface)" },
      { file: "app/admin/finance/layout.tsx", reason: "finance breadcrumb-bar eyebrow (layout chrome, not a page header)" },
      { file: "app/admin/meetings/layout.tsx", reason: "meetings breadcrumb-bar eyebrow (layout chrome, not a page header)" },
      { file: "app/admin/strategic-plan/narrative/_components/shared.tsx", reason: "D5 exemption: presentation deck eyebrow" },
    ],
  },
  { pattern: "text-[28px]", role: "TYPE.cardMetric", allow: [] },
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

/** Opening <h1 ...> tags, complete through their closing ">", multi-line safe. */
function h1OpeningTags(src: string): string[] {
  const tags: string[] = [];
  let idx = src.indexOf("<h1");
  while (idx !== -1) {
    const end = src.indexOf(">", idx);
    tags.push(src.slice(idx, end === -1 ? src.length : end + 1));
    idx = src.indexOf("<h1", idx + 3);
  }
  return tags;
}

/** Opening <h2/<h3 tags, for the retired-literal check. */
function h23OpeningTags(src: string): string[] {
  const tags: string[] = [];
  for (const marker of ["<h2", "<h3"]) {
    let idx = src.indexOf(marker);
    while (idx !== -1) {
      const end = src.indexOf(">", idx);
      tags.push(src.slice(idx, end === -1 ? src.length : end + 1));
      idx = src.indexOf(marker, idx + marker.length);
    }
  }
  return tags;
}

describe("type-drift gate (specs/bloomos-typography.md phase 4.2)", () => {
  const files = tsxFiles(SCAN_ROOT).map((abs) => ({
    rel: abs.slice(process.cwd().length + 1),
    src: readFileSync(abs, "utf8"),
  }));

  test("(a) the display-black voice appears only in the allow-listed metric/brand tail", () => {
    const holders = files.filter((f) => f.src.indexOf("font-display font-black") !== -1).map((f) => f.rel);
    const allowed = new Set(DISPLAY_BLACK_ALLOWLIST.map((a) => a.file));
    expect(
      holders.filter((f) => !allowed.has(f)),
      "font-display font-black is retired from admin (spec D2/D3). Use PageHeader / TYPE.modalTitle for titles; if this is a display metric, add an allowlist entry with a reason.",
    ).toEqual([]);
    const staleA = DISPLAY_BLACK_ALLOWLIST.filter((a) => holders.indexOf(a.file) === -1);
    expect(staleA.map((a) => a.file), "stale display-black allowlist entries — remove them").toEqual([]);
  });

  test("(b) every h1 renders via PageHeader or consumes TYPE", () => {
    const offenders: string[] = [];
    const violatingFiles = new Set<string>();
    for (const f of files) {
      for (const tag of h1OpeningTags(f.src)) {
        if (tag.indexOf("TYPE.") === -1) {
          violatingFiles.add(f.rel);
          if (H1_ALLOWLIST.every((a) => a.file !== f.rel)) offenders.push(`${f.rel}: ${tag.replace(/\s+/g, " ").slice(0, 100)}`);
        }
      }
    }
    expect(
      offenders,
      "Hand-rolled <h1> found. Render the page title via PageHeader (or TYPE.pageTitle where its layout doesn't fit), or add an H1_ALLOWLIST entry with a reason.",
    ).toEqual([]);
    const staleB = H1_ALLOWLIST.filter((a) => !violatingFiles.has(a.file));
    expect(staleB.map((a) => a.file), "stale h1 allowlist entries — remove them").toEqual([]);
  });

  test("(c) retired heading literals do not reappear in h2/h3", () => {
    const offenders: string[] = [];
    for (const f of files) {
      for (const tag of h23OpeningTags(f.src)) {
        for (const lit of RETIRED_HEADING_LITERALS) {
          if (tag.indexOf(lit) !== -1) offenders.push(`${f.rel}: "${lit}"`);
        }
      }
    }
    expect(offenders, "Retired literal used as a heading — use TYPE.cardTitle / SectionHeading instead.").toEqual([]);
  });

  test("(d) role fingerprints appear only in allow-listed files", () => {
    const offenders: string[] = [];
    const stale: string[] = [];
    for (const fp of FINGERPRINTS) {
      const holders = files.filter((f) => f.src.indexOf(fp.pattern) !== -1).map((f) => f.rel);
      const allowed = new Set(fp.allow.map((a) => a.file));
      for (const h of holders) {
        if (!allowed.has(h)) offenders.push(`${h}: "${fp.pattern}" retypes ${fp.role}`);
      }
      for (const a of fp.allow) {
        if (holders.indexOf(a.file) === -1) stale.push(`${a.file} (${fp.pattern})`);
      }
    }
    expect(
      offenders,
      "Inline type-scale retype found. Import TYPE (or use a primitive); if this surface genuinely can't adopt the role, add an allowlist entry with a reason.",
    ).toEqual([]);
    expect(stale, "stale fingerprint allowlist entries — remove them").toEqual([]);
  });
});
