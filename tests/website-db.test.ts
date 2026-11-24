import { afterEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

// The games, the career library and site analytics all read and write the
// website's own database through one client, so an approval in
// /admin/careers and the game that shows it never disagree.

vi.mock("server-only", () => ({}));
const site = { name: "site" };
vi.mock("@/lib/site/supabase", () => ({ getSiteSupabase: () => site }));

import { websiteDb } from "@/lib/site/websiteDb";

afterEach(() => vi.unstubAllEnvs());

describe("websiteDb", () => {
  test("is the website database", () => {
    expect(websiteDb()).toBe(site);
  });

  test("no file touching a website table reaches for the BloomOS client directly", () => {
    const tables =
      "ms_occupations|ms_cards|ms_catalog|ms_rooms|ms_sessions|ms_explored|ms_deliveries|game_pool|game_daily|cut_rooms|cut_players|cut_votes|page_views|click_events";
    const files = execFileSync("git", ["grep", "-lE", `from\\(["'](${tables})["']\\)`, "--", "app", "lib"], {
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean);
    expect(files.length).toBeGreaterThan(25);
    const offenders = files.filter((f) => /getSupabaseAdmin|createClient\(/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
