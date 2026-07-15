import { describe, it, expect } from "vitest";
import {
  COMPLIANCE_QUEUE_LEAD_DAYS,
  addDaysISO,
  complianceQueueHorizon,
  isInComplianceQueue,
  complianceQueueEntry,
  type ComplianceQueueSource,
} from "@/lib/admin/overview/complianceQueue";

const TODAY = "2026-07-15";

function item(overrides: Partial<ComplianceQueueSource> = {}): ComplianceQueueSource {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    title: "IRS 990",
    assigned_to: "shannon",
    status: "upcoming",
    due_date: "2026-08-01",
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

describe("addDaysISO / complianceQueueHorizon", () => {
  it("adds days across month boundaries", () => {
    expect(addDaysISO("2026-07-15", 30)).toBe("2026-08-14");
  });

  it("adds days across year boundaries", () => {
    expect(addDaysISO("2026-12-20", 30)).toBe("2027-01-19");
  });

  it("horizon is today + lead days", () => {
    expect(complianceQueueHorizon(TODAY)).toBe(addDaysISO(TODAY, COMPLIANCE_QUEUE_LEAD_DAYS));
  });
});

describe("isInComplianceQueue", () => {
  it("includes an assigned open item due within 30 days", () => {
    expect(isInComplianceQueue(item({ due_date: "2026-08-01" }), "shannon", TODAY)).toBe(true);
  });

  it("includes an item due exactly 30 days out", () => {
    expect(isInComplianceQueue(item({ due_date: "2026-08-14" }), "shannon", TODAY)).toBe(true);
  });

  it("excludes an item due 31 days out", () => {
    expect(isInComplianceQueue(item({ due_date: "2026-08-15" }), "shannon", TODAY)).toBe(false);
  });

  it("includes overdue items", () => {
    expect(isInComplianceQueue(item({ due_date: "2026-07-01" }), "shannon", TODAY)).toBe(true);
  });

  it("excludes unassigned items", () => {
    expect(isInComplianceQueue(item({ assigned_to: null }), "shannon", TODAY)).toBe(false);
    expect(isInComplianceQueue(item({ assigned_to: "" }), "shannon", TODAY)).toBe(false);
  });

  it("only surfaces in the assignee's own queue", () => {
    expect(isInComplianceQueue(item({ assigned_to: "shannon" }), "remi", TODAY)).toBe(false);
    expect(isInComplianceQueue(item({ assigned_to: "remi" }), "remi", TODAY)).toBe(true);
  });

  it("matches legacy-cased assignee text", () => {
    expect(isInComplianceQueue(item({ assigned_to: "Shannon" }), "shannon", TODAY)).toBe(true);
  });

  it("includes in_progress but excludes filed and waived", () => {
    expect(isInComplianceQueue(item({ status: "in_progress" }), "shannon", TODAY)).toBe(true);
    expect(isInComplianceQueue(item({ status: "filed" }), "shannon", TODAY)).toBe(false);
    expect(isInComplianceQueue(item({ status: "waived" }), "shannon", TODAY)).toBe(false);
  });
});

describe("complianceQueueEntry", () => {
  it("shapes an item like a queue task linking back to /admin/compliance", () => {
    const entry = complianceQueueEntry(item());
    expect(entry).toMatchObject({
      id: "compliance:11111111-1111-1111-1111-111111111111",
      title: "IRS 990",
      category: "compliance",
      due: "2026-08-01",
      pinnedToday: false,
      priority: "high",
      href: "/admin/compliance",
    });
  });
});
