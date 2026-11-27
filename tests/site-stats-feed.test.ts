import { afterEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SiteDay } from "@/lib/site/stats";

// The website's daily numbers for BloomOS (specs/bloomos-repo-split.md §6e
// item 5). BloomOS pulls GET /api/site-admin/stats every morning with a
// bearer SITE_STATS_KEY and writes the totals into Ambition Angels' metrics.

vi.mock("server-only", () => ({}));
const siteDailyStats = vi.fn();
vi.mock("@/lib/site/supabase", () => ({ getSiteSupabase: () => ({}), isSiteDbConfigured: () => true }));
vi.mock("@/lib/site/stats", async (orig) => ({ ...(await orig<object>()), siteDailyStats: (...a: unknown[]) => siteDailyStats(...a) }));

const day = (d: string, o: Partial<SiteDay> = {}): SiteDay => ({
  day: d, page_views: 0, unique_visitors: 0, higher_wage_players: 0, nhoi_players: 0, the_cut_players: 0,
  builtfor_completions: 0, decks_claimed: 0, rooms_run: 0, ...o,
});

afterEach(() => vi.unstubAllEnvs());

describe("the website's stats feed", () => {
  test("refuses a missing or wrong key; answers daily totals for the right one", async () => {
    vi.stubEnv("SITE_STATS_KEY", "s".repeat(40));
    const { GET } = await import("@/app/api/site-admin/stats/route");
    const at = (q: string, auth?: string) =>
      GET(new NextRequest(`https://www.ambitionangels.org/api/site-admin/stats${q}`, auth ? { headers: { authorization: auth } } : undefined));

    expect((await at("?from=2026-11-01&to=2026-11-02")).status).toBe(401);
    expect((await at("?from=2026-11-01&to=2026-11-02", "Bearer nope")).status).toBe(401);
    expect((await at("?from=2026-11-02&to=2026-11-01", `Bearer ${"s".repeat(40)}`)).status).toBe(400);

    siteDailyStats.mockResolvedValueOnce([day("2026-11-01", { page_views: 9 })]);
    const ok = await at("?from=2026-11-01&to=2026-11-01", `Bearer ${"s".repeat(40)}`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ from: "2026-11-01", to: "2026-11-01", days: [day("2026-11-01", { page_views: 9 })] });
  });

  test("with no SITE_STATS_KEY set, nothing gets in", async () => {
    vi.stubEnv("SITE_STATS_KEY", "");
    const { GET } = await import("@/app/api/site-admin/stats/route");
    const res = await GET(new NextRequest("https://www.ambitionangels.org/api/site-admin/stats?from=2026-11-01&to=2026-11-01", { headers: { authorization: "Bearer " } }));
    expect(res.status).toBe(401);
  });
});
