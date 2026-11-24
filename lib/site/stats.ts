import "server-only";
import { getSiteSupabase } from "./supabase";

/**
 * The website's daily numbers (site_daily_stats in the website database).
 * One definition for the website admin home and for what BloomOS pulls into
 * Ambition Angels' metrics, so both always show the same figures.
 */

export type SiteDay = {
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

export const STAT_KEYS = [
  "page_views",
  "unique_visitors",
  "higher_wage_players",
  "nhoi_players",
  "the_cut_players",
  "builtfor_completions",
  "decks_claimed",
  "rooms_run",
] as const;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date in Pacific time, as YYYY-MM-DD. */
export function pacificToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(now);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Validates a from/to window: ISO dates, from ≤ to, at most 400 days. */
export function parseRange(from: string | null, to: string | null): { from: string; to: string } | null {
  if (!from || !to || !ISO.test(from) || !ISO.test(to) || from > to) return null;
  const span = (Date.parse(to) - Date.parse(from)) / 86_400_000;
  return span <= 400 ? { from, to } : null;
}

export async function siteDailyStats(from: string, to: string): Promise<SiteDay[]> {
  const { data, error } = await getSiteSupabase().rpc("site_daily_stats", { p_from: from, p_to: to });
  if (error) throw new Error(`site_daily_stats: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const row: Record<string, unknown> = { day: String(r.day) };
    for (const k of STAT_KEYS) row[k] = Number(r[k] ?? 0);
    return row as SiteDay;
  });
}

export function sumDays(days: SiteDay[]): Omit<SiteDay, "day"> {
  const out = Object.fromEntries(STAT_KEYS.map((k) => [k, 0])) as Omit<SiteDay, "day">;
  for (const d of days) for (const k of STAT_KEYS) out[k] += d[k];
  return out;
}
