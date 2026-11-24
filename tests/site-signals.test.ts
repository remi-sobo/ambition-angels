import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mockSupabase } from "./support/supabaseMock";

// Repo split §6e item 5: the website's daily numbers flow into Ambition
// Angels' BloomOS metrics. The site serves daily totals behind a bearer key;
// BloomOS keeps that key encrypted on a connections row and a daily cron
// upserts site.* metric snapshots, backfilling the whole history once.

vi.mock("server-only", () => ({}));
let db = mockSupabase([]);
const upserts: { rows: unknown; opts: unknown }[] = [];
const withUpsert = (m: ReturnType<typeof mockSupabase>) => {
  m.client.upsert = (rows: unknown, opts: unknown) => (upserts.push({ rows, opts }), m.client);
  return m;
};
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => db.client }));
const siteDailyStats = vi.fn();
vi.mock("@/lib/site/supabase", () => ({ getSiteSupabase: () => ({}), isSiteDbConfigured: () => true }));
vi.mock("@/lib/site/stats", async (orig) => ({ ...(await orig<object>()), siteDailyStats: (...a: unknown[]) => siteDailyStats(...a) }));

import {
  BACKFILL_MAX_DAYS,
  SITE_METRICS,
  chunkWindow,
  pacificYesterday,
  parseStatsDays,
  siteMetricDefinitions,
  syncWindow,
  toSnapshots,
  trimLeadingEmpty,
  validStatsUrl,
  type SiteStatsDay,
} from "@/lib/siteSignals/metrics";
import { syncSiteSignals } from "@/lib/siteSignals/server";
import { encryptSecret, toByteaHex } from "@/lib/crypto/secret-box";

const day = (d: string, o: Partial<SiteStatsDay> = {}): SiteStatsDay => ({
  day: d, page_views: 0, unique_visitors: 0, higher_wage_players: 0, nhoi_players: 0, the_cut_players: 0,
  builtfor_completions: 0, decks_claimed: 0, rooms_run: 0, ...o,
});

beforeEach(() => {
  vi.stubEnv("BLOOMOS_TOKEN_ENC_KEY", randomBytes(32).toString("base64"));
  upserts.length = 0;
});
afterEach(() => vi.unstubAllEnvs());

describe("the metrics", () => {
  test("six site.* metrics, daily counts, no owner (so never 'stale' in Today)", () => {
    const defs = siteMetricDefinitions("org-1");
    expect(defs.map((d) => d.metric_key)).toEqual([
      "site.games_played", "site.builtfor_completions", "site.decks_claimed", "site.rooms_run", "site.unique_visitors", "site.page_views",
    ]);
    for (const d of defs) {
      expect(d).toMatchObject({ org_id: "org-1", cadence: "daily", unit: "count", source_kind: "manual", source_key: "site_signals" });
      expect(d).not.toHaveProperty("owner_id");
    }
  });

  test("games played adds the three quick games' players and finished Built For runs", () => {
    const games = SITE_METRICS.find((m) => m.metric_key === "site.games_played")!;
    expect(games.value(day("2026-11-01", { higher_wage_players: 3, nhoi_players: 2, the_cut_players: 1, builtfor_completions: 4, decks_claimed: 9 }))).toBe(10);
  });

  test("one snapshot per metric per day, against that org's metric ids", () => {
    const ids = Object.fromEntries(SITE_METRICS.map((m, i) => [m.metric_key, `m${i}`]));
    const rows = toSnapshots("org-1", ids, [day("2026-11-01", { page_views: 7 }), day("2026-11-02")]);
    expect(rows).toHaveLength(12);
    expect(rows.find((r) => r.metric_id === "m5" && r.captured_on === "2026-11-01")?.value).toBe(7);
  });
});

describe("the windows", () => {
  test("yesterday is the Pacific day before", () => {
    expect(pacificYesterday(new Date("2026-11-24T07:30:00Z"))).toBe("2026-11-22"); // 11:30pm on the 23rd, Pacific
    expect(pacificYesterday(new Date("2026-11-24T12:30:00Z"))).toBe("2026-11-23");
  });

  test("first run backfills; later runs re-read the last 3 days; nothing new is null", () => {
    expect(syncWindow(null, "2026-11-23")).toEqual({ from: "2023-08-12", to: "2026-11-23", backfill: true });
    expect(syncWindow("2026-11-20", "2026-11-23")).toEqual({ from: "2026-11-18", to: "2026-11-23", backfill: false });
    expect(syncWindow("2026-11-23", "2026-11-23")).toEqual({ from: "2026-11-21", to: "2026-11-23", backfill: false });
    expect(syncWindow("2026-11-26", "2026-11-23")).toBeNull();
  });

  test("calls stay within the feed's 400-day limit", () => {
    const w = syncWindow(null, "2026-11-23")!;
    const chunks = chunkWindow(w.from, w.to);
    expect(chunks).toHaveLength(BACKFILL_MAX_DAYS / 400);
    expect(chunks[0].from).toBe(w.from);
    expect(chunks.at(-1)!.to).toBe(w.to);
    for (const c of chunks) expect((Date.parse(c.to) - Date.parse(c.from)) / 86_400_000).toBeLessThan(400);
  });

  test("a backfill drops the zero days before the website's first activity, but keeps quiet days after it", () => {
    const days = [day("2026-04-27"), day("2026-04-28"), day("2026-04-29", { page_views: 5 }), day("2026-04-30"), day("2026-05-01", { rooms_run: 1 })];
    expect(trimLeadingEmpty(days).map((d) => d.day)).toEqual(["2026-04-29", "2026-04-30", "2026-05-01"]);
    expect(trimLeadingEmpty([day("2026-01-01")])).toEqual([]);
  });

  test("the feed is parsed defensively", () => {
    expect(parseStatsDays({ days: [{ day: "2026-11-01", page_views: 4, rooms_run: -1 }, { day: "nope" }, null] })).toEqual([day("2026-11-01", { page_views: 4 })]);
    expect(() => parseStatsDays({ error: "x" })).toThrow();
  });

  test("the stats address is https with no credentials", () => {
    expect(validStatsUrl("https://www.ambitionangels.org/api/site-admin/stats/")).toBe("https://www.ambitionangels.org/api/site-admin/stats");
    expect(validStatsUrl("http://www.ambitionangels.org/api/site-admin/stats")).toBeNull();
    expect(validStatsUrl("https://u:p@example.org/stats")).toBeNull();
    expect(validStatsUrl("https://example.org/stats?key=x")).toBeNull();
    expect(validStatsUrl(42)).toBeNull();
  });
});

describe("the sync", () => {
  const feedRow = (key: string) => ({
    data: { id: "c1", access_token_enc: toByteaHex(encryptSecret(key)), meta: { stats_url: "https://site.test/api/site-admin/stats" } },
  });
  const defs = { data: SITE_METRICS.map((m, i) => ({ id: `m${i}`, metric_key: m.metric_key })) };

  test("first run: creates the definitions, backfills in 400-day calls with the decrypted key, upserts by metric and day", async () => {
    db = withUpsert(mockSupabase([feedRow("k".repeat(32)), { error: null }, defs, { data: null }, { error: null }, { data: null }]));
    const seen: { url: string; auth: string | null }[] = [];
    const f = (async (url: string, init: RequestInit) => {
      seen.push({ url, auth: new Headers(init.headers).get("authorization") });
      const to = new URL(url).searchParams.get("to")!;
      const days = to === "2026-11-23" ? [day("2026-11-21"), day("2026-11-22", { page_views: 3 }), day("2026-11-23", { unique_visitors: 2 })] : [day("2025-01-01")];
      return new Response(JSON.stringify({ days }), { status: 200 });
    }) as unknown as typeof fetch;

    const r = await syncSiteSignals("org-1", { f, now: new Date("2026-11-24T12:30:00Z") });
    expect(r).toEqual({ ok: true, orgId: "org-1", days: 2, written: 12, from: "2026-11-22", to: "2026-11-23" });
    expect(seen).toHaveLength(3);
    expect(seen.every((s) => s.auth === `Bearer ${"k".repeat(32)}`)).toBe(true);
    expect(upserts[0].opts).toEqual({ onConflict: "org_id,metric_key", ignoreDuplicates: true });
    expect(upserts[1].opts).toEqual({ onConflict: "metric_id,captured_on" });
    expect(db.calls.update[0]).toMatchObject({ status: "active", meta: { last_day: "2026-11-23", last_error: null } });
  });

  test("a refused key is recorded on the connection, and the run reports it", async () => {
    db = withUpsert(mockSupabase([feedRow("k".repeat(32)), { error: null }, defs, { data: { captured_on: "2026-11-20" } }, { data: null }]));
    const f = (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
    const r = await syncSiteSignals("org-1", { f, now: new Date("2026-11-24T12:30:00Z") });
    expect(r).toEqual({ ok: false, orgId: "org-1", error: "The website refused the stats key" });
    expect(db.calls.update[0]).toMatchObject({ status: "error", meta: { last_error: "The website refused the stats key" } });
  });

  test("an org with no saved feed gets nothing", async () => {
    db = withUpsert(mockSupabase([{ data: null }]));
    expect(await syncSiteSignals("org-2")).toEqual({ ok: false, orgId: "org-2", error: "No website stats feed saved" });
  });
});

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

describe("wiring", () => {
  test("the cron is scheduled daily after the Pacific day ends, behind CRON_SECRET", async () => {
    const crons = JSON.parse(readFileSync(join(__dirname, "..", "vercel.json"), "utf8")).crons as { path: string; schedule: string }[];
    expect(crons.find((c) => c.path === "/api/cron/site-signals")?.schedule).toBe("30 12 * * *");
    vi.stubEnv("CRON_SECRET", "c");
    const { GET } = await import("@/app/api/cron/site-signals/route");
    expect((await GET(new NextRequest("https://app.bloomos.org/api/cron/site-signals"))).status).toBe(401);
  });

  test("the settings route needs org.manage and aa.site_signals, and audits only the address, never the key", () => {
    const src = readFileSync(join(__dirname, "..", "app", "api", "admin", "settings", "site-signals", "route.ts"), "utf8");
    expect(src).toMatch(/requirePermission\("org\.manage", \{ entitlement: "aa\.site_signals" \}\)/);
    expect(src).toMatch(/after: \{ stats_url: statsUrl \}/);
  });
});
