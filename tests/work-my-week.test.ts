import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// Spec Work, stage W2 — My Week becomes the week grid (Handoff Spec folds
// Calendar in). House structural pins: the grid moved, the V1 calendar route
// stayed byte-identical, and the grid's own navigation follows the screen
// that embeds it (?week=/?owner= must keep working on both paths).

const app = join(__dirname, "..", "app");
const src = (...p: string[]) => readFileSync(join(app, ...p), "utf8");

describe("W2 structural pins", () => {
  test("the V1 calendar route is a thin stub over the extracted WeekSection", () => {
    const s = src("admin", "calendar", "page.tsx");
    expect(s).toMatch(/import WeekSection from "\.\/WeekSection"/);
    expect(s).toMatch(/<WeekSection searchParams=\{searchParams\} \/>/);
    // No basePath override and no embedded flag: the stub renders the
    // default standalone variant — byte-identical to the pre-W2 page.
    expect(s).not.toMatch(/basePath=/);
    expect(s).not.toMatch(/embedded/);
    expect(s).not.toMatch(/getWeekView/);
    expect(s).toMatch(/force-dynamic/);
  });

  test("WeekSection carries the moved grid body and defaults to the V1 path", () => {
    const s = src("admin", "calendar", "WeekSection.tsx");
    expect(s).toMatch(/basePath = "\/admin\/calendar"/);
    expect(s).toMatch(/getWeekView/);
    // The URL contract survives the move: week validated, owner defaulted.
    expect(s).toMatch(/searchParams\?\.week/);
    expect(s).toMatch(/searchParams\?\.owner \?\? ctx\.userId/);
    // Embedded on My Week: no second page chrome, and the grid gets the
    // embedding screen's basePath.
    expect(s).toMatch(/<WeekGrid view=\{view\} basePath=\{basePath\} \/>/);
  });

  test("WeekGrid's week/owner navigation follows basePath — no hardcoded calendar pushes remain", () => {
    const s = src("admin", "calendar", "WeekGrid.tsx");
    expect(s).toMatch(/basePath = "\/admin\/calendar"/); // V1 default
    const pushes = s.match(/router\.push\(`\$\{basePath\}\?/g) ?? [];
    expect(pushes.length).toBe(2); // week nav + owner switcher
    expect(s).not.toMatch(/router\.push\(`\/admin\/calendar/);
  });

  test("My Week composes status → the one ritual door → the embedded grid, on its own basePath", () => {
    const s = src("admin", "work", "my-week", "page.tsx");
    // No longer the B2 re-export of the doors page.
    expect(s).not.toMatch(/from "@\/app\/admin\/ops\/my-week\/page"/);
    expect(s).toMatch(/<WeekStatusLine status=\{status\} \/>/);
    expect(s).toMatch(/href="\/admin\/work\/plan-close"/);
    expect(s).toMatch(/basePath="\/admin\/work\/my-week"/);
    expect(s).toMatch(/searchParams=\{searchParams\}/);
    expect(s.indexOf("WeekStatusLine status")).toBeLessThan(s.indexOf('href="/admin/work/plan-close"'));
    expect(s.indexOf('href="/admin/work/plan-close"')).toBeLessThan(s.indexOf("<WeekSection"));
    // One door, not two: the ritual routes are never linked directly — Plan
    // & Close carries both flows since W1.
    expect(s).not.toMatch(/\/admin\/ops\/monday|\/admin\/ops\/friday/);
  });

  test("the seat's gate follows the model: my-week belongs to modules.meetings now", () => {
    const layout = src("admin", "work", "my-week", "layout.tsx");
    expect(layout).toMatch(/feature="modules\.meetings"/);
  });
});
