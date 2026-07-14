import { describe, expect, it } from "vitest";
import {
  ASSIGNEE_REQUIRED_MESSAGE,
  TASK_CATEGORIES,
  taskHasAssignee,
} from "@/app/admin/ops/_types/ops";

// Every task needs an owner: a team member (assigned_to) or an owning
// department/team via category. 'other' is a catch-all, not a department.
describe("taskHasAssignee", () => {
  it("rejects a task with no team member and the 'other' catch-all category", () => {
    expect(taskHasAssignee("", "other")).toBe(false);
    expect(taskHasAssignee(null, "other")).toBe(false);
    expect(taskHasAssignee(undefined, "other")).toBe(false);
  });

  it("accepts a team member regardless of category", () => {
    expect(taskHasAssignee("remi", "other")).toBe(true);
    expect(taskHasAssignee("shannon", "fundraising")).toBe(true);
  });

  it("accepts every real department category without a team member", () => {
    for (const c of TASK_CATEGORIES.filter((c) => c !== "other")) {
      expect(taskHasAssignee("", c), c).toBe(true);
    }
  });

  it("does not treat an unknown category string as a department", () => {
    expect(taskHasAssignee("", "not-a-category")).toBe(false);
  });

  it("exposes a user-facing message for the forms", () => {
    expect(ASSIGNEE_REQUIRED_MESSAGE.length).toBeGreaterThan(0);
  });
});
