import { describe, expect, test } from "vitest";
import { buildStuckProjectContext } from "@/lib/admin/ops/stuck-context";

// Stuck Work project context: the rollup shows each stuck task's project plus
// the fundraising identifiers derived for it (donor = grant funder + task-
// linked constituents, partnership = task-linked partners). These tests pin
// the aggregation the UI renders from.

type LinkedTask = {
  project_id: string | null;
  linked_entity_type: "partner" | "constituent" | null;
  linked_label: string | null;
};

const P1 = "11111111-1111-1111-1111-111111111111";
const P2 = "22222222-2222-2222-2222-222222222222";
const G1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

describe("buildStuckProjectContext", () => {
  test("grant-backed project surfaces the funder as donor", () => {
    const out = buildStuckProjectContext(
      [{ id: P1, title: "Tech Innovation Grant", grant_id: G1 }],
      { [G1]: "A to Z Impact Foundation" },
      []
    );
    expect(out[P1]).toEqual({
      id: P1,
      title: "Tech Innovation Grant",
      donors: ["A to Z Impact Foundation"],
      partnerships: [],
    });
  });

  test("task-linked constituents and partners aggregate onto their project", () => {
    const tasks: LinkedTask[] = [
      { project_id: P1, linked_entity_type: "constituent", linked_label: "Cal Henderson" },
      { project_id: P1, linked_entity_type: "partner", linked_label: "LEMO" },
      // Another project's link must not bleed into P1.
      { project_id: P2, linked_entity_type: "partner", linked_label: "Sophie's Scholars" },
      // Standalone task links are ignored (no project to attach them to).
      { project_id: null, linked_entity_type: "constituent", linked_label: "Bella" },
    ];
    const out = buildStuckProjectContext(
      [
        { id: P1, title: "Cal Henderson", grant_id: null },
        { id: P2, title: "LEMO Orientation", grant_id: null },
      ],
      {},
      tasks
    );
    expect(out[P1].donors).toEqual(["Cal Henderson"]);
    expect(out[P1].partnerships).toEqual(["LEMO"]);
    expect(out[P2].donors).toEqual([]);
    expect(out[P2].partnerships).toEqual(["Sophie's Scholars"]);
  });

  test("dedupes case-insensitively, funder name first; blanks dropped", () => {
    const tasks: LinkedTask[] = [
      { project_id: P1, linked_entity_type: "constituent", linked_label: "a to z impact foundation" },
      { project_id: P1, linked_entity_type: "constituent", linked_label: "Bella" },
      { project_id: P1, linked_entity_type: "constituent", linked_label: "  " },
      { project_id: P1, linked_entity_type: "constituent", linked_label: null },
    ];
    const out = buildStuckProjectContext(
      [{ id: P1, title: "FY26 Ask", grant_id: G1 }],
      { [G1]: "A to Z Impact Foundation" },
      tasks
    );
    expect(out[P1].donors).toEqual(["A to Z Impact Foundation", "Bella"]);
  });

  test("project with no grant and no linked tasks yields empty identifier lists", () => {
    const out = buildStuckProjectContext(
      [{ id: P1, title: "Board Meeting - Q3", grant_id: null }],
      {},
      [{ project_id: P1, linked_entity_type: null, linked_label: null }]
    );
    expect(out[P1].donors).toEqual([]);
    expect(out[P1].partnerships).toEqual([]);
  });
});
