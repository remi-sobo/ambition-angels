import { describe, expect, test } from "vitest";
import {
  NAV_SECTIONS,
  activeHref,
  resolveSectionNav,
  type NavSection,
} from "@/lib/admin/nav";

// The horizontal sub-topic bar is derived from the sidebar IA rather than
// hand-wired per route group — that opt-in wiring is why only Fundraising used
// to show sibling sub-topics. These tests hold the derivation to the reported
// acceptance criteria.

const ALL_FEATURES = Array.from(
  new Set(
    NAV_SECTIONS.flatMap((s) => [
      ...s.items.map((i) => i.feature),
      ...(s.tabs ?? []).map((t) => t.feature),
      ...s.items.flatMap((i) => (i.tabs ?? []).map((t) => t.feature)),
    ]).filter((f): f is string => !!f)
  )
);

function nav(pathname: string, features: string[] | null = ALL_FEATURES) {
  return resolveSectionNav(pathname, { features });
}

/** Labels of the row that lists the section's sibling sub-topics. */
function sectionRow(pathname: string): string[] {
  return nav(pathname)?.rows[0].tabs.map((t) => t.label) ?? [];
}

function activeLabel(pathname: string, row = 0): string | undefined {
  return nav(pathname)?.rows[row].tabs.find((t) => t.active)?.label;
}

const sectionsWithSubtopics: NavSection[] = NAV_SECTIONS.filter(
  (s) => s.items.filter((i) => i.href).length > 1 || (s.tabs?.length ?? 0) > 1
);

describe("admin section sub-topic nav", () => {
  test("every section with sub-topics shows them on every one of its pages", () => {
    const missing: string[] = [];
    for (const section of sectionsWithSubtopics) {
      const expected = (
        section.tabs ?? section.items.filter((i) => i.href).map((i) => ({ href: i.href as string }))
      ).map((t) => t.href);
      for (const item of section.items) {
        if (!item.href) continue;
        const rows = nav(item.href)?.rows;
        const hrefs = rows?.[0].tabs.map((t) => t.href) ?? [];
        if (expected.some((h) => hrefs.indexOf(h) === -1)) {
          missing.push(`${section.label} @ ${item.href}`);
        }
      }
    }
    expect(missing, "sections missing their sibling sub-topic links").toEqual([]);
  });

  test("every sub-topic link points into its own section", () => {
    for (const section of sectionsWithSubtopics) {
      const first = section.items.find((i) => i.href)!.href as string;
      for (const tab of nav(first)!.rows[0].tabs) {
        // Following the link lands on a page that still shows the same row.
        expect(sectionRow(tab.href), `${section.label} → ${tab.href}`).toEqual(
          sectionRow(first)
        );
      }
    }
  });

  test("exactly one tab per row is marked active", () => {
    const routes = NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href)).filter(
      (h): h is string => !!h
    );
    for (const route of routes) {
      for (const row of nav(route)?.rows ?? []) {
        expect(row.tabs.filter((t) => t.active).length, route).toBe(1);
      }
    }
  });

  // ── Fundraising is the reference implementation and must not change ───────
  test("Fundraising keeps its exact tab set, order, and active matching", () => {
    const expected = [
      "Today's Moves",
      "Donors",
      "Pipeline",
      "Prospects",
      "Ask Log",
      "Grants",
      "Campaigns",
      "Strategy",
    ];
    expect(nav("/admin/fundraising/today")!.rows).toHaveLength(1);
    expect(sectionRow("/admin/fundraising/today")).toEqual(expected);
    expect(activeLabel("/admin/fundraising/today")).toBe("Today's Moves");
    expect(activeLabel("/admin/fundraising")).toBe("Pipeline");
    expect(activeLabel("/admin/fundraising/prospects/abc")).toBe("Prospects");
    expect(activeLabel("/admin/fundraising/donors/abc")).toBe("Donors");
    // Pages with no tab of their own stay on the section root's pill.
    expect(activeLabel("/admin/fundraising/acknowledgments")).toBe("Pipeline");
  });

  // ── The sections that were missing the bar ────────────────────────────────
  test("Operations pages list Work · Meetings · Staff · Documents", () => {
    for (const path of ["/admin/ops/projects", "/admin/meetings", "/admin/staff", "/admin/documents"]) {
      expect(sectionRow(path), path).toEqual(["Work", "Meetings", "Staff", "Documents"]);
    }
    expect(activeLabel("/admin/staff")).toBe("Staff");
    expect(activeLabel("/admin/ops/projects")).toBe("Work");
  });

  test("Program pages list every program sub-topic", () => {
    expect(sectionRow("/admin/cohorts")).toEqual([
      "Students",
      "Cohorts",
      "Volunteers",
      "Demo Day",
      "YGB Camp",
      "Schools & Partners",
      "Career Library",
    ]);
    // Volunteers is IA-homed in Program even though its route sits under
    // /admin/fundraising — the longer prefix wins, so it gets Program's bar.
    expect(activeLabel("/admin/fundraising/volunteers")).toBe("Volunteers");
    expect(sectionRow("/admin/fundraising/volunteers")).toEqual(sectionRow("/admin/cohorts"));
  });

  test("Governance pages list Board · Compliance", () => {
    expect(sectionRow("/admin/compliance")).toEqual(["Board", "Compliance"]);
    expect(activeLabel("/admin/compliance")).toBe("Compliance");
  });

  test("Command Center pages list its sub-topics", () => {
    expect(sectionRow("/admin/inbox")).toEqual([
      "Overview",
      "Inbox",
      "Messages",
      "Strategy",
      "Executive Briefing",
    ]);
    expect(activeLabel("/admin/inbox")).toBe("Inbox");
  });

  // ── Product tab rows ──────────────────────────────────────────────────────
  test("a product with its own tabs gets a second row under the section row", () => {
    const ops = nav("/admin/ops/projects")!;
    expect(ops.rows.map((r) => r.label)).toEqual(["Operations", "Work"]);
    expect(ops.rows[1].tabs.map((t) => t.label)).toEqual(["My Week", "Tasks", "Projects"]);
    expect(activeLabel("/admin/ops/projects", 1)).toBe("Projects");
    // The Monday/Friday wizards belong to My Week.
    expect(activeLabel("/admin/ops/monday", 1)).toBe("My Week");

    const meetings = nav("/admin/meetings/connections")!;
    expect(meetings.rows.map((r) => r.label)).toEqual(["Operations", "Meetings"]);
    expect(activeLabel("/admin/meetings/connections", 1)).toBe("Connections");

    // Intake keeps the Students tabs even though its routes live elsewhere.
    const intake = nav("/admin/intake")!;
    expect(intake.rows.map((r) => r.label)).toEqual(["Program", "Students"]);
    expect(intake.rows[1].tabs.map((t) => t.label)).toEqual(["Roster", "Intake"]);
    expect(activeLabel("/admin/intake", 1)).toBe("Intake");
  });

  test("a one-item section shows only its product tabs (Finance unchanged)", () => {
    const finance = nav("/admin/finance/budget")!;
    expect(finance.rows.map((r) => r.label)).toEqual(["Finance"]);
    expect(finance.rows[0].tabs).toHaveLength(12);
    expect(activeLabel("/admin/finance/budget")).toBe("Budget");
    // Sub-routes keep their parent tab lit.
    expect(activeLabel("/admin/finance/budget/import")).toBe("Budget");
    expect(activeLabel("/admin/finance")).toBe("Dashboard");
  });

  test("a section with nothing to fan out shows no bar", () => {
    expect(nav("/admin/analytics")).toBeNull();
  });

  // ── Entitlements + terminology ────────────────────────────────────────────
  test("tabs the org isn't entitled to are dropped, like the sidebar", () => {
    const features = ALL_FEATURES.filter((f) => f !== "modules.staff");
    expect(
      resolveSectionNav("/admin/documents", { features })!.rows[0].tabs.map((t) => t.label)
    ).toEqual(["Work", "Meetings", "Documents"]);
    // And a page whose own module is off gets no bar at all — it renders the
    // not-authorized panel.
    expect(resolveSectionNav("/admin/staff", { features })).toBeNull();
  });

  test("term-driven tabs use the org's vocabulary", () => {
    const terms = { student: "Scholars", volunteer: "Leaders" };
    const labels = resolveSectionNav("/admin/cohorts", { features: ALL_FEATURES, terms })!
      .rows[0].tabs.map((t) => t.label);
    expect(labels.slice(0, 3)).toEqual(["Scholars", "Cohorts", "Leaders"]);
  });

  test("unrecognized admin routes fall back to their nearest section", () => {
    // Overview owns /admin, so utility pages under it carry Command Center.
    expect(activeHref("/admin/settings")).toBe("/admin");
    expect(sectionRow("/admin/settings")[0]).toBe("Overview");
  });
});
