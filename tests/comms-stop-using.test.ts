import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Remi, 2026-11-21: staff may revoke a participant's consent ("Stop using
// this story"), never record or restore it. Staff lack comms.subjects.read,
// so the route must work from the story id alone and reveal nothing.

const ROOT = join(__dirname, "..");
const route = readFileSync(join(ROOT, "app/api/admin/comms/stories/[id]/stop-using/route.ts"), "utf8");
const controls = readFileSync(join(ROOT, "app/admin/comms/_components/StoryControls.tsx"), "utf8");
const page = readFileSync(join(ROOT, "app/admin/comms/stories/[id]/page.tsx"), "utf8");

describe("Stop using this story", () => {
  it("is open to comms.manage (staff included), not comms.subjects.read", () => {
    expect(route).toMatch(/requirePermission\("comms\.manage", \{ entitlement: "modules\.comms" \}\)/);
    expect(route).not.toMatch(/(ctxHasPermission|requirePermission)\([^)]*comms\.subjects\.read/);
  });

  it("pins every read and write to the active org", () => {
    const pins = route.match(/\.eq\("org_id", ctx\.orgId\)/g) ?? [];
    expect(pins.length).toBeGreaterThanOrEqual(3);
  });

  it("only revokes, only participants, only live grants", () => {
    expect(route).toMatch(/\.eq\("subject_type", "participant"\)/);
    expect(route).toMatch(/\.update\(\{ revoked_at:/);
    expect(route).toMatch(/\.is\("revoked_at", null\)/);
    expect(route).not.toMatch(/\.insert\(/);
    expect(route).not.toMatch(/\.delete\(/);
    expect(route).not.toMatch(/revoked_at: null/);
  });

  it("returns a count, never who is in the story", () => {
    expect(route).toMatch(/NextResponse\.json\(\{ ok: true, revoked \}\)/);
    expect(route).not.toMatch(/label|first_name|guardian|subject_id:/);
  });

  it("is audited", () => {
    expect(route).toMatch(/action: "comms\.consent\.revoke_story"/);
  });

  it("asks before it revokes and is shown whenever a participant is in the story", () => {
    expect(controls).toMatch(/export function StopUsingStoryButton/);
    expect(controls).toMatch(/setConfirming\(true\)/);
    expect(controls).toMatch(/\/stop-using/);
    expect(page).toMatch(/<StopUsingStoryButton storyId=\{story\.id\} \/>/);
  });
});
