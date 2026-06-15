import { describe, expect, test } from "vitest";
import {
  taskStatusToStatus,
  projectStatusToStatus,
  scoreToStatus,
  categoryDot,
  CATEGORY_DOT,
} from "../lib/admin/status";

describe("status scale mapping", () => {
  test("task status → five-value scale", () => {
    expect(taskStatusToStatus("blocked")).toBe("critical");
    expect(taskStatusToStatus("done")).toBe("healthy");
    expect(taskStatusToStatus("todo")).toBe("neutral");
    expect(taskStatusToStatus("in_progress")).toBe("neutral");
    expect(taskStatusToStatus("anything-else")).toBe("neutral");
  });

  test("project status → scale", () => {
    expect(projectStatusToStatus("at_risk")).toBe("critical");
    expect(projectStatusToStatus("active")).toBe("due");
    expect(projectStatusToStatus("done")).toBe("healthy");
    expect(projectStatusToStatus("archived")).toBe("neutral");
  });
});

describe("prospect score tiers", () => {
  test("hot ≥70 → healthy, warm 40-69 → watch, cool <40 → neutral", () => {
    expect(scoreToStatus(82)).toBe("healthy");
    expect(scoreToStatus(70)).toBe("healthy");
    expect(scoreToStatus(55)).toBe("watch");
    expect(scoreToStatus(40)).toBe("watch");
    expect(scoreToStatus(12)).toBe("neutral");
    expect(scoreToStatus(null)).toBe("neutral");
    expect(scoreToStatus(undefined)).toBe("neutral");
  });
});

describe("category dots (taxonomy stays neutral, hue is a dot)", () => {
  test("known categories resolve, unknown falls back to 'other'", () => {
    expect(categoryDot("fundraising")).toBe(CATEGORY_DOT.fundraising);
    expect(categoryDot("definitely-not-a-category")).toBe(CATEGORY_DOT.other);
  });
});
