import { describe, expect, test } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { resolveShellNav, shellMobileSplit, MOBILE_BAR_STAND_IN } from "@/lib/admin/v2shellNav";

// V4 Stage P (part 1): the lint allowlist driven to zero. One source guard
// per migrated file (no raw table, no hand-built overlay, no unlabeled
// control, and the kit piece it moved onto), plus the leftovers.

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const RAW_TABLE = /<table\b/;
const OVERLAY = /className=["`{][^>]*\bfixed\b[^>]*\binset-0\b/;

type Guard = { file: string; moved: "overlay" | "table" | "inputs"; must: RegExp[] };

const KIT_TABLE = /<(StaticTable|DataTable)\b/;
const KIT_FIELD = /<(TextField|TextareaField|SelectField|DateField|CheckboxField)\b/;

const GUARDS: Guard[] = [
  // Overlays → kit Drawer / Modal
  { file: "app/admin/_components/feedback/ConfirmProvider.tsx", moved: "overlay", must: [/<Modal\b/, /layer="top"/] },
  { file: "app/admin/_components/search/GlobalSearch.tsx", moved: "overlay", must: [/<Modal\b[^>]*\bbare\b/, /aria-label="Search BloomOS"/] },
  { file: "app/admin/_components/QuickAddModal.tsx", moved: "overlay", must: [/<Drawer\b/, KIT_FIELD, /save\(\{/] },
  { file: "app/admin/_components/ReportModal.tsx", moved: "overlay", must: [/<Drawer\b/, /htmlFor="report-description"/] },
  { file: "app/admin/_components/TaskEditModal.tsx", moved: "overlay", must: [/<Drawer\b/, KIT_FIELD] },
  { file: "app/admin/_components/v2/V2MobileBar.tsx", moved: "overlay", must: [/<Drawer open=\{sheet === "more"\}/, /<Drawer open=\{sheet === "actions"\}/] },
  { file: "app/admin/_components/v2/V2Sidebar.tsx", moved: "overlay", must: [/<Drawer\b[\s\S]*?side="left"/] },
  { file: "app/admin/_components/v2/V2QuickAdd.tsx", moved: "overlay", must: [/addEventListener\("pointerdown"/] },
  { file: "app/admin/_components/LoginScreen.tsx", moved: "overlay", must: [/admin-bare min-h-\[100dvh\]/, /aria-label="Email"/, /aria-label="Password"/] },
  { file: "app/admin/capture/_components/CaptureModal.tsx", moved: "overlay", must: [/<Modal\b/] },
  { file: "app/admin/capture/_components/EditSheet.tsx", moved: "overlay", must: [/<Modal\b/, KIT_FIELD] },
  { file: "app/admin/capture/_components/FixSheet.tsx", moved: "overlay", must: [/<Modal\b/, KIT_FIELD] },
  { file: "app/admin/fundraising/_components/OpportunityEditModal.tsx", moved: "overlay", must: [/<Drawer\b/] },
  { file: "app/admin/fundraising/_components/TaskComposer.tsx", moved: "overlay", must: [/<Drawer\b/, KIT_FIELD] },
  { file: "app/admin/fundraising/acknowledgments/_components/LogAckButton.tsx", moved: "overlay", must: [/<Drawer\b/] },
  { file: "app/admin/fundraising/donors-funders/_components/ResearchDrawer.tsx", moved: "overlay", must: [/<ResearchDrawerShell closeHref=\{closeHref\}>/] },
  { file: "app/admin/fundraising/donors-funders/_components/ResearchDrawerShell.tsx", moved: "overlay", must: [/<Drawer\b/, /router\.push\(closeHref/] },
  { file: "app/admin/fundraising/prospects/_components/AddProspectModal.tsx", moved: "overlay", must: [/<Drawer\b/, KIT_FIELD] },
  { file: "app/admin/fundraising/strategy/_components/NewAngleForm.tsx", moved: "overlay", must: [/<Drawer\b/, KIT_FIELD] },
  { file: "app/admin/fundraising/strategy/_components/ReedAngleWizard.tsx", moved: "overlay", must: [/<Drawer\b/, KIT_FIELD] },
  { file: "app/admin/messages/_components/NewMessageModal.tsx", moved: "overlay", must: [/<Modal\b/, KIT_FIELD] },
  // Raw tables → kit table
  { file: "app/admin/legacy/page.tsx", moved: "table", must: [KIT_TABLE, /<SubmissionDrawer\b/] },
  { file: "app/admin/demoday/DemoDaySignups.tsx", moved: "table", must: [KIT_TABLE] },
  { file: "app/admin/fundraising/asks/AskLog.tsx", moved: "table", must: [KIT_TABLE] },
  { file: "app/admin/fundraising/campaigns/gift-tables/[id]/_components/PlanVsActual.tsx", moved: "table", must: [KIT_TABLE, /level removed/] },
  { file: "app/admin/fundraising/campaigns/gift-tables/[id]/page.tsx", moved: "table", must: [KIT_TABLE, /kind: "total"/] },
  { file: "app/admin/fundraising/donors-funders/companies/page.tsx", moved: "table", must: [KIT_TABLE, /nextStep=\{/] },
  { file: "app/admin/fundraising/prospects/[id]/_components/BriefSections/WhatTheyCareAbout.tsx", moved: "table", must: [KIT_TABLE] },
  { file: "app/admin/fundraising/prospects/[id]/_components/DealsTable.tsx", moved: "table", must: [KIT_TABLE] },
  { file: "app/admin/fundraising/prospects/_components/ProspectsTable.tsx", moved: "table", must: [KIT_TABLE, /kind: "run"/, /downloadCsv\(filtered\)/, /bloomos\.table\.prospects\.views/] },
  { file: "app/admin/fundraising/prospects/import/_components/HubspotImportPicker.tsx", moved: "table", must: [KIT_TABLE, /kind: "run"/] },
  { file: "app/admin/fundraising/settings/stages/_components/StagesEditor.tsx", moved: "table", must: [KIT_TABLE, /aria-label=\{`Label for /] },
  { file: "app/admin/imports/_components/ImportWizard.tsx", moved: "table", must: [KIT_TABLE] },
  // Unlabeled controls → kit fields or a label
  ...[
    "app/admin/_components/EntityDocuments.tsx",
    "app/admin/_components/MentionTextarea.tsx",
    "app/admin/_components/reed/ReedPanel.tsx",
    "app/admin/demoday/DemoDayTracker.tsx",
    "app/admin/fundraising/_components/FunderPicker.tsx",
    "app/admin/fundraising/acknowledgments/templates/_components/TemplateManager.tsx",
    "app/admin/fundraising/asks/_components/AskControls.tsx",
    "app/admin/fundraising/campaigns/_components/CampaignControls.tsx",
    "app/admin/fundraising/comms/_components/CommsControls.tsx",
    "app/admin/fundraising/donors/_components/AckChannelPref.tsx",
    "app/admin/fundraising/donors/_components/JourneyControls.tsx",
    "app/admin/fundraising/donors-funders/_components/WhyTheyMatter.tsx",
    "app/admin/fundraising/donors-funders/page.tsx",
    "app/admin/fundraising/grants/_components/GrantCoach.tsx",
    "app/admin/fundraising/grants/_components/GrantContacts.tsx",
    "app/admin/fundraising/grants/_components/GrantControls.tsx",
    "app/admin/fundraising/pledges/_components/PledgeControls.tsx",
    "app/admin/fundraising/prospects/[id]/_components/ProspectAngles.tsx",
    "app/admin/fundraising/strategy/_components/AngleEditorCard.tsx",
    "app/admin/fundraising/strategy/_components/DiscoverPanel.tsx",
    "app/admin/intake/_components/IntakeControls.tsx",
    "app/admin/messages/_components/MessagesView.tsx",
    "app/admin/partners/[id]/_components/MergeControl.tsx",
    "app/admin/partners/_components/PartnersWorkspace.tsx",
  ].map((file) => ({ file, moved: "inputs" as const, must: [/aria-label=|htmlFor=/] })),
  ...[
    "app/admin/fundraising/donors/_components/ConstituentControls.tsx",
    "app/admin/fundraising/donors/_components/HouseholdControls.tsx",
    "app/admin/fundraising/donors/_components/LogThankYou.tsx",
    "app/admin/fundraising/donors/_components/SoftCreditControls.tsx",
    "app/admin/fundraising/plan/_components/PlanControls.tsx",
    "app/admin/fundraising/prospects/[id]/_components/ScoreEditor.tsx",
    "app/admin/fundraising/strategy/_components/RoomMetaEditor.tsx",
    "app/admin/fundraising/strategy/_components/StrategyBoard.tsx",
    "app/admin/partners/[id]/_components/PartnerProfileControls.tsx",
  ].map((file) => ({ file, moved: "inputs" as const, must: [KIT_FIELD] })),
];

const require = createRequire(import.meta.url);
const { countOffenders } = require("../eslint/admin-kit-counts.js") as {
  countOffenders: () => Promise<{ counts: Record<string, Record<string, number>>; files: number }>;
};

describe("Stage P1 source guards: each migrated file is on the kit", () => {
  for (const g of GUARDS) {
    test(`${g.file} (${g.moved})`, () => {
      const src = read(g.file);
      expect(src, "raw <table>").not.toMatch(RAW_TABLE);
      expect(src, "hand-built overlay").not.toMatch(OVERLAY);
      for (const re of g.must) expect(src, String(re)).toMatch(re);
    });
  }

  test("no migrated file has an unlabeled control (the lint rule's own selector)", async () => {
    const { counts } = await countOffenders();
    const hits = GUARDS.flatMap((g) => Object.keys(counts).filter((rule) => counts[rule][g.file]).map((rule) => `${g.file}: ${rule}`));
    expect(hits).toEqual([]);
  }, 120_000);

  test("the V1 shared table and the capture-only focus trap are gone; the kit has one of each", () => {
    expect(existsSync(join(ROOT, "app/admin/_components/DataTable.tsx"))).toBe(false);
    expect(existsSync(join(ROOT, "app/admin/capture/_lib/useFocusTrap.ts"))).toBe(false);
    expect(read("app/admin/_components/ui/index.ts")).toMatch(/StaticTable/);
  });

  test("the shared focus trap answers only the innermost overlay", () => {
    const trap = read("app/admin/_components/ui/useFocusTrap.ts");
    expect(trap).toMatch(/openTraps\[openTraps\.length - 1\] !== token/);
  });
});

describe("Stage P1 leftovers", () => {
  test("Strategy sub-pages carry PageHeader v2 (breadcrumb back to the plan, More actions)", () => {
    for (const f of [
      "app/admin/strategic-plan/narrative/page.tsx",
      "app/admin/strategic-plan/people/page.tsx",
      "app/admin/strategic-plan/setup/page.tsx",
      "app/admin/strategic-plan/scorecard/ScorecardSection.tsx",
    ]) {
      const src = read(f);
      expect(src, f).toMatch(/breadcrumb=\{\[\{ label: "Strategic Plan", href: "\/admin\/organization\/strategy" \}\]\}/);
      expect(src, f).toMatch(/moreActions=\{\[/);
    }
    expect(read("app/admin/strategic-plan/narrative/page.tsx")).toMatch(/primaryAction=\{<ButtonLink href="\/admin\/strategic-plan\/narrative\?present=1">/);
  });

  test("Donors & Funders: dates and money never wrap; Owner truncates", () => {
    const src = read("app/admin/fundraising/donors-funders/page.tsx");
    expect(src).toMatch(/key: "last_gift"[^\n]*whitespace-nowrap/);
    expect(src).toMatch(/key: "last_touch"[^\n]*whitespace-nowrap/);
    expect(src).toMatch(/className: "text-ink-2 max-w-\[9rem\]"/);
    expect(src).toMatch(/block truncate" title=\{owner\}/);
  });

  test("Capture copy names no operator", () => {
    expect(read("app/admin/capture/_lib/captureApi.ts")).toMatch(/supportHint\(\)/);
    expect(read("app/admin/capture/_lib/captureApi.ts")).not.toMatch(/Remi/);
    expect(read("app/admin/capture/_components/CaptureModal.tsx")).not.toMatch(/Shannon/);
  });

  test("phone bar: Programs stands in for a missing Fundraising slot", () => {
    expect(MOBILE_BAR_STAND_IN).toEqual({ fundraising: "programs" });
    const features = ["modules.program", "modules.ops", "modules.fundraising"];
    const staff = ["program.read", "program.write", "ops.read", "ops.write"];
    expect(shellMobileSplit(resolveShellNav(features, null, staff)).bar.map((d) => d.key)).toEqual(["home", "work", "programs"]);
    expect(shellMobileSplit(resolveShellNav(features, null, [...staff, "fundraising.read"])).bar.map((d) => d.key)).toEqual([
      "home",
      "work",
      "fundraising",
    ]);
  });
});
