import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseProofPoints, proofPointsToShow } from "@/lib/admin/strategy/proofPoints";

// V4 Stage G, part 1: Work and Organization on the standard
// (specs/bloomos-v4-product-readiness.md §5, §6, §13 Stage G).

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

describe("strategy proof points: the org's own, or none (no Ambition Angels fallback)", () => {
  test("an org with no proof points gets an empty list, never another org's numbers", () => {
    expect(proofPointsToShow(null)).toEqual([]);
    expect(proofPointsToShow(undefined)).toEqual([]);
    expect(proofPointsToShow({ proofPoints: [] })).toEqual([]);
    expect(proofPointsToShow({ proofPoints: null })).toEqual([]);
  });

  test("an org's own proof points are shown as they are", () => {
    const own = [{ value: "240", label: "families served" }];
    expect(proofPointsToShow({ proofPoints: own })).toEqual(own);
  });

  test("jsonb parsing is defensive and drops blank values", () => {
    expect(parseProofPoints(null)).toEqual([]);
    expect(parseProofPoints({ value: "1" })).toEqual([]);
    expect(parseProofPoints([{ value: " 12 ", label: " sites " }, { value: "", label: "x" }, null])).toEqual([
      { value: "12", label: "sites" },
    ]);
  });

  test("no Ambition Angels headline stats anywhere in the strategy screens", () => {
    for (const f of [
      "app/admin/strategic-plan/narrative/_components/MovementPlan.tsx",
      "app/admin/strategic-plan/_components/PlanControls.tsx",
      "app/admin/strategic-plan/page.tsx",
      "lib/admin/strategy/narrative.ts",
    ]) {
      const src = strip(read(f));
      expect(src, f).not.toMatch(/3,500|87%|1,100\+|Title I|FALLBACK_PROOF/);
    }
    expect(read("app/admin/strategic-plan/narrative/_components/MovementPlan.tsx")).toMatch(/proofPointsToShow\(plan\.foundation\)/);
  });
});

// ── Source guards: each migrated screen uses the kit pieces its archetype
// needs and has no raw table, hand-built overlay or unlabeled control. ────
import { PROJECT_TABLE, parseProjectFilters, projectFilterParams, projectNextStep, projectViews } from "@/lib/admin/ops/projectList";
import { documentNextStep, documentFilterParams } from "@/lib/documents/hubList";
import { memberNextStep } from "@/lib/admin/board/roster";
import { complianceNextStep, inView } from "@/lib/admin/compliance/calendar";
import { parseTableState } from "@/lib/admin/dataTable";

const NO_RAW = (src: string, f: string) => {
  expect(src, `${f}: raw <table>`).not.toMatch(/<table\b/);
  expect(src, `${f}: hand-built overlay`).not.toMatch(/className=["`{][^>]*\bfixed\b[^>]*\binset-0\b/);
};

type Guard = { file: string; archetype: string; must: RegExp[] };
const SCREENS: Guard[] = [
  { file: "app/admin/ops/page.tsx", archetype: "List (Tasks)", must: [/primaryAction=\{<NewTaskButton/, /<SummaryStrip/, /<Figure[\s\S]*?source=/, /moreActions=/] },
  { file: "app/admin/ops/_components/TasksSurface.tsx", archetype: "List (Tasks surface)", must: [/<FilterRow/, /<SegmentedControl/, /saveAction\(/, /aria-label="Owner"/] },
  { file: "app/admin/ops/projects/page.tsx", archetype: "List (Projects)", must: [/<DataTable\b/, /<SavedViews/, /<SummaryStrip/, /nextStep=\{/, /primaryAction=\{newProject\}/, /parseTableState/] },
  { file: "app/admin/ops/_components/ProjectListControls.tsx", archetype: "Form (New project)", must: [/<Drawer\b/, /<FilterRow/, /useSaveAction\(\)/, /<TextField/] },
  { file: "app/admin/ops/projects/[id]/page.tsx", archetype: "Detail (Project)", must: [/breadcrumb=\{/, /chips=\{/, /<NextStepBar/, /<SummaryStrip/, /primaryAction=\{/] },
  { file: "app/admin/ops/projects/[id]/_components/ProjectActivityLog.tsx", archetype: "Detail timeline", must: [/<Timeline\b/] },
  { file: "app/admin/ops/projects/[id]/_components/ProjectHeader.tsx", archetype: "Detail panel", must: [/<SelectField/, /<DateField/, /saveAction\(/, /<MoreActionsMenu/] },
  { file: "app/admin/ops/_components/RhythmWizard.tsx", archetype: "Form, multi-step (Plan & Close)", must: [/<PageHeader/, /moreActions=\{/, /<Stepper/] },
  { file: "app/admin/work/my-week/page.tsx", archetype: "Dashboard (My Week)", must: [/primaryAction=\{/, /moreActions=\{/] },
  { file: "app/admin/calendar/BlockPanel.tsx", archetype: "Form (block sheet)", must: [/<Drawer\b/, /<TextField/] },
  { file: "app/admin/calendar/WeekGrid.tsx", archetype: "Board (week grid)", must: [/saveAction\(/] },
  { file: "app/admin/meetings/page.tsx", archetype: "Dashboard (Meetings)", must: [/primaryAction=\{<SyncMeetingsButton/, /<SummaryStrip/, /moreActions=/] },
  { file: "app/admin/meetings/[id]/page.tsx", archetype: "Detail (Meeting)", must: [/breadcrumb=\{/, /chips=\{/] },
  { file: "app/admin/meetings/upcoming/[eventId]/page.tsx", archetype: "Detail (Meeting prep)", must: [/breadcrumb=\{/, /primaryAction=\{/] },
  { file: "app/admin/meetings/booking-page/BookingHistory.tsx", archetype: "List (Booking history)", must: [/<DataTable\b/] },
  { file: "app/admin/meetings/booking-page/BookingPageSettings.tsx", archetype: "Settings (Booking page)", must: [/<TextField/, /saveAction\(/] },
  { file: "app/admin/documents/page.tsx", archetype: "List (Documents)", must: [/<DataTable\b/, /<SavedViews/, /<SummaryStrip/, /primaryAction=\{<UploadDocumentButton/, /nextStep=\{/] },
  { file: "app/admin/documents/_components/DocumentEditModal.tsx", archetype: "Form (Edit document)", must: [/<Drawer\b/, /saveAction\(/] },
  { file: "app/admin/documents/_components/UploadDocumentButton.tsx", archetype: "Form (Upload)", must: [/<Drawer\b/, /saveAction\(/] },
  { file: "app/admin/board/page.tsx", archetype: "List (Board)", must: [/<DataTable\b/, /<SummaryStrip/, /primaryAction=\{<NewMemberForm/, /nextStep=\{/] },
  { file: "app/admin/board/_components/BoardControls.tsx", archetype: "Form (Board member)", must: [/<Drawer\b/, /<MoreActionsMenu/, /saveAction\(/] },
  { file: "app/admin/board/[id]/page.tsx", archetype: "Detail (Board member)", must: [/breadcrumb=\{/, /<NextStepBar/, /<SummaryStrip/, /primaryAction=\{<EditMemberProfile/] },
  { file: "app/admin/compliance/page.tsx", archetype: "List (Compliance)", must: [/<DataTable\b/, /<SavedViews/, /<SummaryStrip/, /primaryAction=\{<NewComplianceForm/, /nextStep=\{/] },
  { file: "app/admin/compliance/_components/ComplianceControls.tsx", archetype: "Form (Deadline)", must: [/<Drawer\b/, /<MoreActionsMenu/, /saveAction\(/] },
  { file: "app/admin/compliance/[id]/page.tsx", archetype: "Detail (Deadline)", must: [/breadcrumb=\{/, /<NextStepBar/, /<SummaryStrip/] },
  { file: "app/admin/strategic-plan/page.tsx", archetype: "Dashboard (Strategy)", must: [/primaryAction=\{<NewObjectiveForm/, /<SummaryStrip/, /<EmptyState/, /moreActions=\{/] },
  { file: "app/admin/strategic-plan/objective/[id]/page.tsx", archetype: "Detail (Objective)", must: [/breadcrumb=\{/, /<SummaryStrip/] },
  { file: "app/admin/strategic-plan/narrative/_components/Presenter.tsx", archetype: "Stage (presenter)", must: [/<Stage\b/] },
  { file: "app/admin/staff/page.tsx", archetype: "Board (Team chart)", must: [/primaryAction=\{/, /<SummaryStrip/, /moreActions=\{<StaffHeaderActions/] },
  { file: "app/admin/staff/[id]/page.tsx", archetype: "Detail (Teammate)", must: [/breadcrumb=\{/, /chips=\{/, /primaryAction=\{/] },
  { file: "app/admin/staff/[id]/_components/StaffEditForm.tsx", archetype: "Form (Edit teammate)", must: [/<Drawer\b/, /saveAction\(/] },
];

describe("Work and Organization screens are on the kit (V4 Stage G)", () => {
  for (const g of SCREENS) {
    test(`${g.archetype}: ${g.file}`, () => {
      const src = strip(read(g.file));
      NO_RAW(src, g.file);
      for (const re of g.must) expect(src, `${g.file} should match ${re}`).toMatch(re);
    });
  }

  test("no raw fetch write is left without saveAction in Work and Organization client code", () => {
    // Every write site either is the saveAction request function or lives in
    // a file that routes through saveAction.
    const files = [
      "app/admin/ops/_components/TaskRow.tsx",
      "app/admin/ops/_components/TaskBoardView.tsx",
      "app/admin/ops/_components/TaskRowWithActions.tsx",
      "app/admin/ops/_components/FridayClose.tsx",
      "app/admin/ops/_components/MondayCommit.tsx",
      "app/admin/ops/monday/WeekPlanner.tsx",
      "app/admin/meetings/SyncMeetingsButton.tsx",
      "app/admin/meetings/[id]/MeetingDetailClient.tsx",
      "app/admin/meetings/_components/FollowUpQuickActions.tsx",
      "app/admin/meetings/_components/CancelBookingButton.tsx",
      "app/admin/documents/_components/DocumentActions.tsx",
      "app/admin/strategic-plan/_components/PlanControls.tsx",
      "app/admin/staff/reviews/_components/ReviewsAdminClient.tsx",
    ];
    for (const f of files) {
      const src = strip(read(f));
      expect(src, f).toMatch(/saveAction|useSaveAction/);
      expect(src, `${f}: a write fetch outside saveAction`).not.toMatch(/await fetch\([^)]*\{\s*method:\s*"(POST|PATCH|PUT|DELETE)"/);
    }
  });

  test("money is never optimistic: the filing fee write has no optimistic step", () => {
    const src = strip(read("app/admin/compliance/[id]/_components/ComplianceDetailControls.tsx"));
    const feeSave = src.slice(src.indexOf("fee: fee.trim() === \"\" ? null"));
    expect(read("app/admin/compliance/[id]/_components/ComplianceDetailControls.tsx")).toMatch(/A fee is money: no optimistic change/);
    expect(feeSave.slice(0, 400)).not.toMatch(/optimistic:/);
  });
});

describe("projects list: URL state and next step", () => {
  const isCat = (s: string) => ["fundraising", "program", "other"].includes(s);
  test("filters keep the V1 vocabulary; status defaults to active and 'all' (or V1's '') means every status", () => {
    expect(parseProjectFilters({}, isCat)).toMatchObject({ status: "active", category: "", assignee: "", q: "", showGrants: false });
    expect(parseProjectFilters({ status: "all" }, isCat).status).toBe("all");
    expect(parseProjectFilters({ status: "" }, isCat).status).toBe("all");
    expect(parseProjectFilters({ status: "nope", category: "bogus", grants: "show" }, isCat)).toMatchObject({ status: "active", category: "", showGrants: true });
    expect(projectFilterParams(parseProjectFilters({ status: "done", q: " gala ", assignee: "me" }, isCat))).toEqual({ status: "done", q: "gala", assignee: "me" });
  });
  test("sort and page go through DataTable v2 with the last-touched default", () => {
    expect(parseTableState({}, PROJECT_TABLE)).toEqual({ page: 0, sort: { key: "last_touched_at", dir: "desc" } });
    expect(parseTableState({ sort: "title", page: "2" }, PROJECT_TABLE)).toEqual({ page: 2, sort: { key: "title", dir: "asc" } });
    expect(parseTableState({ sort: "drop table" }, PROJECT_TABLE).sort?.key).toBe("last_touched_at");
  });
  test("saved views put My projects first and mark the active one", () => {
    const { views, activeKey } = projectViews("/x", parseProjectFilters({ assignee: "me" }, isCat));
    expect(views[0]).toMatchObject({ key: "mine", mine: true, href: "/x?assignee=me" });
    expect(activeKey).toBe("mine");
  });
  test("next step: late first and says how late; then owner, then first task", () => {
    const today = "2026-11-21";
    expect(projectNextStep({ status: "active", due_date: "2026-11-18", assigned_to: "dana" }, 3, today)).toEqual({ text: "3 days late. Set a new date or close it", tone: "late" });
    expect(projectNextStep({ status: "active", due_date: null, assigned_to: null }, 3, today).text).toBe("Assign an owner");
    expect(projectNextStep({ status: "active", due_date: null, assigned_to: "dana" }, 0, today).text).toBe("Add the first task");
    expect(projectNextStep({ status: "active", due_date: "2026-11-24", assigned_to: "dana" }, 2, today)).toEqual({ text: "Due in 3 days", tone: "due" });
    expect(projectNextStep({ status: "done", due_date: "2026-01-01", assigned_to: null }, 0, today).tone).toBe("quiet");
  });
});

describe("documents, board and compliance next steps", () => {
  const today = "2026-11-21";
  test("documents: renewals first", () => {
    expect(documentNextStep({ status: "active", expires_at: "2026-11-19" }, today)).toEqual({ text: "Renew: expired 2 days ago", tone: "late" });
    expect(documentNextStep({ status: "active", expires_at: "2026-12-01" }, today)).toEqual({ text: "Renew within 10 days", tone: "due" });
    expect(documentNextStep({ status: "active", expires_at: null }, today).tone).toBe("quiet");
    expect(documentFilterParams({ view: "all", status: "active", type: "all", owner: "all", q: "" })).toEqual({});
  });
  test("board: term ended beats COI beats renewal beats linking", () => {
    const base = { status: "active", coi_signed_at: "2026-02-01", term_end: "2028-01-01", constituent_id: "c1" };
    expect(memberNextStep({ ...base, term_end: "2026-10-01" }, 2026, today).tone).toBe("late");
    expect(memberNextStep({ ...base, coi_signed_at: "2025-03-01" }, 2026, today).text).toMatch(/conflict-of-interest/);
    expect(memberNextStep({ ...base, term_end: "2027-02-01" }, 2026, today).text).toMatch(/renewal/);
    expect(memberNextStep({ ...base, constituent_id: null }, 2026, today).text).toMatch(/donor record/);
    expect(memberNextStep(base, 2026, today)).toEqual({ text: "Nothing due", tone: "quiet" });
  });
  test("compliance: views and the late step", () => {
    const late = { status: "upcoming", due_date: "2026-11-01", recur: "annual" };
    const soon = { status: "in_progress", due_date: "2026-12-01", recur: "none" };
    const filed = { status: "filed", due_date: "2027-11-01", recur: "annual" };
    expect([late, soon, filed].filter((i) => inView(i, "overdue", today))).toEqual([late]);
    expect([late, soon, filed].filter((i) => inView(i, "soon", today))).toEqual([soon]);
    expect([late, soon, filed].filter((i) => inView(i, "closed", today))).toEqual([filed]);
    expect(complianceNextStep(late, today)).toEqual({ text: "20 days late. File or waive", tone: "late" });
    expect(complianceNextStep(soon, today)).toEqual({ text: "Finish and file within 10 days", tone: "due" });
    expect(complianceNextStep({ ...soon, due_date: "2027-01-20" }, today)).toEqual({ text: "Due in 60 days", tone: "quiet" });
  });
});
