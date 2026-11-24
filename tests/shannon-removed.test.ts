import { describe, expect, test } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Repo split step 2g (specs/bloomos-repo-split.md §5, acceptance item 13):
// the one-off /shannon page and its API are gone, so /shannon is a 404.
const ROOT = join(__dirname, "..");

describe("/shannon is deleted", () => {
  test("no page and no API route", () => {
    expect(existsSync(join(ROOT, "app", "shannon"))).toBe(false);
    expect(existsSync(join(ROOT, "app", "api", "shannon"))).toBe(false);
  });
  test("SiteChrome no longer carves out /shannon", () => {
    expect(readFileSync(join(ROOT, "components", "SiteChrome.tsx"), "utf8")).not.toMatch(/\/shannon/);
  });
});
