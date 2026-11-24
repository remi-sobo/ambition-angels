/**
 * Website numbers in BloomOS (specs/bloomos-repo-split.md §6e item 5). PURE:
 * the metric catalog rows, how a website day becomes metric values, and the
 * date windows the daily sync asks for. lib/siteSignals/server.ts does the I/O.
 */

/** One day as the website's stats feed returns it (lib/site/stats.ts SiteDay). */
export type SiteStatsDay = {
  day: string;
  page_views: number;
  unique_visitors: number;
  higher_wage_players: number;
  nhoi_players: number;
  the_cut_players: number;
  builtfor_completions: number;
  decks_claimed: number;
  rooms_run: number;
};

export type SiteMetric = {
  metric_key: string;
  name: string;
  description: string;
  value: (d: SiteStatsDay) => number;
};

export const SITE_METRICS: SiteMetric[] = [
  {
    metric_key: "site.games_played",
    name: "Website games played",
    description:
      "Plays across the website's teen games each day: unique players of Higher Wage, Never Heard of It and The Cut, plus finished Built For runs.",
    value: (d) => d.higher_wage_players + d.nhoi_players + d.the_cut_players + d.builtfor_completions,
  },
  {
    metric_key: "site.builtfor_completions",
    name: "Built For completions",
    description: "Built For runs finished on the website each day.",
    value: (d) => d.builtfor_completions,
  },
  {
    metric_key: "site.decks_claimed",
    name: "Built For decks played",
    description: "Built For card decks claimed on the website each day.",
    value: (d) => d.decks_claimed,
  },
  {
    metric_key: "site.rooms_run",
    name: "Classroom rooms run",
    description: "Built For and The Cut rooms started on the website each day.",
    value: (d) => d.rooms_run,
  },
  {
    metric_key: "site.unique_visitors",
    name: "Website visitors",
    description: "Unique visitors to the website each day, Pacific time.",
    value: (d) => d.unique_visitors,
  },
  {
    metric_key: "site.page_views",
    name: "Website page views",
    description: "Page views on the website each day, Pacific time.",
    value: (d) => d.page_views,
  },
];

/** The metric_definitions rows for one org. Daily, counted, recorded by the sync (no owner, so never "stale" in Today). */
export function siteMetricDefinitions(orgId: string) {
  return SITE_METRICS.map((m) => ({
    org_id: orgId,
    metric_key: m.metric_key,
    name: m.name,
    description: m.description,
    department: "program",
    unit: "count",
    direction: "up",
    cadence: "daily",
    source_kind: "manual",
    source_key: "site_signals",
    active: true,
  }));
}

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Parses the feed's days defensively: bad rows are dropped, bad numbers count as 0. */
export function parseStatsDays(body: unknown): SiteStatsDay[] {
  const days = (body as { days?: unknown })?.days;
  if (!Array.isArray(days)) throw new Error("stats feed returned no days");
  return days
    .filter((d): d is Record<string, unknown> => !!d && typeof d === "object" && ISO.test(String((d as { day?: unknown }).day)))
    .map((d) => ({
      day: String(d.day),
      page_views: n(d.page_views),
      unique_visitors: n(d.unique_visitors),
      higher_wage_players: n(d.higher_wage_players),
      nhoi_players: n(d.nhoi_players),
      the_cut_players: n(d.the_cut_players),
      builtfor_completions: n(d.builtfor_completions),
      decks_claimed: n(d.decks_claimed),
      rooms_run: n(d.rooms_run),
    }));
}

const isEmpty = (d: SiteStatsDay) => SITE_METRICS.every((m) => m.value(d) === 0);

/** Drops the all-zero days before the website's first recorded activity, so a backfill doesn't invent a history of zeros. */
export function trimLeadingEmpty(days: SiteStatsDay[]): SiteStatsDay[] {
  const sorted = [...days].sort((a, b) => a.day.localeCompare(b.day));
  const first = sorted.findIndex((d) => !isEmpty(d));
  return first === -1 ? [] : sorted.slice(first);
}

export function addDays(iso: string, k: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + k);
  return d.toISOString().slice(0, 10);
}

/** Yesterday in Pacific time: the last full website day. */
export function pacificYesterday(now = new Date()): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(now);
  return addDays(today, -1);
}

/** The feed allows 400 days per call. */
export const MAX_SPAN_DAYS = 400;
/** First run looks back this far (in 400-day calls) for the start of the website's history. */
export const BACKFILL_MAX_DAYS = 3 * MAX_SPAN_DAYS;
/** Every run re-reads the last few days, so late-arriving numbers correct themselves. */
export const REREAD_DAYS = 3;

/**
 * What to ask the feed for. With no snapshots yet: a backfill reaching back
 * BACKFILL_MAX_DAYS. Otherwise from a few days before the latest snapshot.
 * null when there is nothing new.
 */
export function syncWindow(latestCaptured: string | null, yesterday: string): { from: string; to: string; backfill: boolean } | null {
  if (!latestCaptured) return { from: addDays(yesterday, -(BACKFILL_MAX_DAYS - 1)), to: yesterday, backfill: true };
  const from = addDays(latestCaptured, -(REREAD_DAYS - 1));
  return from > yesterday ? null : { from, to: yesterday, backfill: false };
}

/** Splits a window into calls of at most MAX_SPAN_DAYS days, oldest first. */
export function chunkWindow(from: string, to: string): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  let start = from;
  while (start <= to) {
    const end = addDays(start, MAX_SPAN_DAYS - 1);
    out.push({ from: start, to: end < to ? end : to });
    start = addDays(end, 1);
  }
  return out;
}

/** metric_snapshots rows for the days, one per metric per day. */
export function toSnapshots(orgId: string, metricIds: Record<string, string>, days: SiteStatsDay[]) {
  const rows: { org_id: string; metric_id: string; captured_on: string; value: number; note: string }[] = [];
  for (const d of days) {
    for (const m of SITE_METRICS) {
      const id = metricIds[m.metric_key];
      if (id) rows.push({ org_id: orgId, metric_id: id, captured_on: d.day, value: m.value(d), note: "website" });
    }
  }
  return rows;
}

/** The stats URL must be https (http only for localhost), with no credentials in it. */
export function validStatsUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw.trim());
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol !== "https:" && !(local && u.protocol === "http:")) return null;
    if (u.username || u.password || u.search || u.hash) return null;
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}
