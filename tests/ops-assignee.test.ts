import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ASSIGNEE_REQUIRED_MESSAGE, taskHasAssignee } from "@/app/admin/ops/_types/ops";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8");

// Every task needs a PERSON as its owner. A category used to count as an
// owner ("Fundraising owns it"), which is how tasks got saved with nobody
// assigned and were missed — the Today-page report from Shannon.
describe("taskHasAssignee", () => {
  it("rejects a task with no team member", () => {
    expect(taskHasAssignee("")).toBe(false);
    expect(taskHasAssignee("   ")).toBe(false);
    expect(taskHasAssignee(null)).toBe(false);
    expect(taskHasAssignee(undefined)).toBe(false);
  });

  it("accepts any non-empty team-member handle", () => {
    expect(taskHasAssignee("remi")).toBe(true);
    expect(taskHasAssignee("shannon")).toBe(true);
  });

  it("no longer lets a category stand in for a person", () => {
    // The old two-argument signature is gone; a category alone is never an
    // owner. Keep this as a guard against reintroducing the loophole.
    expect((taskHasAssignee as unknown as (a: string, c: string) => boolean)("", "fundraising")).toBe(false);
  });

  it("exposes a clear user-facing message for the forms", () => {
    expect(ASSIGNEE_REQUIRED_MESSAGE).toMatch(/needs an owner/i);
    expect(ASSIGNEE_REQUIRED_MESSAGE).toMatch(/assigned to/i);
  });
});

describe("the requirement is enforced end to end (structural)", () => {
  it("POST /api/admin/ops/tasks refuses a task with no assignee", () => {
    const src = read("app", "api", "admin", "ops", "tasks", "route.ts");
    expect(src).toMatch(/if \(!taskHasAssignee\(body\.assigned_to/);
    expect(src).toMatch(/error: ASSIGNEE_REQUIRED_MESSAGE \}, \{ status: 400 \}/);
    // The insert never writes a null owner any more.
    expect(src).not.toMatch(/assigned_to: \(body\.assigned_to as string \| null \| undefined\) \?\? null/);
  });

  it("PATCH /api/admin/ops/tasks/[id] may hand off a task but never clear its owner", () => {
    const src = read("app", "api", "admin", "ops", "tasks", "[id]", "route.ts");
    expect(src).toMatch(/if \("assigned_to" in body\) \{\s*\/\/[^\n]*\n[^\n]*\n\s*if \(!taskHasAssignee\(body\.assigned_to/);
  });

  it("every human create form marks the assignee required and blocks submit", () => {
    const forms = [
      ["app", "admin", "_components", "QuickAddModal.tsx"],
      ["app", "admin", "_components", "TaskEditModal.tsx"],
      ["app", "admin", "_components", "EntityTasks.tsx"],
      ["app", "admin", "ops", "projects", "[id]", "_components", "ProjectTaskList.tsx"],
      ["app", "admin", "fundraising", "_components", "TaskComposer.tsx"],
    ];
    for (const path of forms) {
      const src = read(...path);
      expect(src, path.join("/")).toMatch(/taskHasAssignee\(/);
      expect(src, path.join("/")).toMatch(/ASSIGNEE_REQUIRED_MESSAGE/);
      expect(src, path.join("/")).toMatch(/aria-required="true"/);
      expect(src, path.join("/")).not.toMatch(/>Unassigned</);
    }
    // The inline add on the task list owns the task to the signed-in person
    // and refuses to post when there is nobody to own it.
    const list = read("app", "admin", "ops", "_components", "TaskListView.tsx");
    expect(list).toMatch(/if \(!taskHasAssignee\(currentUser\)\)/);
  });
});
