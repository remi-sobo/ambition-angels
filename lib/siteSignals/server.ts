import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret, fromBytea, toByteaHex } from "@/lib/crypto/secret-box";
import {
  SITE_METRICS,
  chunkWindow,
  pacificYesterday,
  parseStatsDays,
  siteMetricDefinitions,
  syncWindow,
  toSnapshots,
  trimLeadingEmpty,
  type SiteStatsDay,
} from "./metrics";

/**
 * Website numbers in BloomOS (specs/bloomos-repo-split.md §6e item 5).
 *
 * The org's website stats feed (URL + bearer key) lives on a `connections`
 * row, the key encrypted with BLOOMOS_TOKEN_ENC_KEY like every integration
 * token. Nothing website-specific is in BloomOS's environment: an org with
 * aa.site_signals and a saved feed gets its numbers, any other org nothing.
 *
 * The sync writes metric_snapshots against site.* metric_definitions and
 * upserts on (metric_id, captured_on), so a re-run or a Vercel retry never
 * double-counts.
 */

export const SITE_STATS_PROVIDER = "site_stats";
const EXTERNAL_ID = "default";
const FETCH_TIMEOUT_MS = 20_000;

type Meta = { stats_url?: string; last_synced_at?: string; last_day?: string; last_error?: string | null; saved_by?: string };

export type SiteSignalsStatus =
  | { state: "none" }
  | { state: "active" | "error"; statsUrl: string; lastSyncedAt: string | null; lastDay: string | null; lastError: string | null };

export async function getSiteSignalsStatus(orgId: string): Promise<SiteSignalsStatus> {
  const { data } = await getSupabaseAdmin()
    .from("connections")
    .select("status, meta")
    .eq("org_id", orgId)
    .eq("provider", SITE_STATS_PROVIDER)
    .eq("external_id", EXTERNAL_ID)
    .maybeSingle();
  if (!data) return { state: "none" };
  const meta = (data.meta ?? {}) as Meta;
  return {
    state: data.status === "active" ? "active" : "error",
    statsUrl: meta.stats_url ?? "",
    lastSyncedAt: meta.last_synced_at ?? null,
    lastDay: meta.last_day ?? null,
    lastError: meta.last_error ?? null,
  };
}

export async function saveSiteSignalsConfig(args: { orgId: string; savedBy: string; statsUrl: string; key: string }): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await getSupabaseAdmin()
    .from("connections")
    .upsert(
      {
        org_id: args.orgId,
        provider: SITE_STATS_PROVIDER,
        external_id: EXTERNAL_ID,
        access_token_enc: toByteaHex(encryptSecret(args.key)),
        status: "active",
        meta: { stats_url: args.statsUrl, saved_by: args.savedBy, last_error: null } satisfies Meta,
        updated_at: now,
      },
      { onConflict: "org_id,provider,external_id" },
    );
  if (error) throw new Error(`site_stats connection save failed: ${error.message}`);
}

type Feed = { id: string; statsUrl: string; key: string; meta: Meta };

async function loadFeed(orgId: string): Promise<Feed | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("connections")
    .select("id, access_token_enc, meta")
    .eq("org_id", orgId)
    .eq("provider", SITE_STATS_PROVIDER)
    .eq("external_id", EXTERNAL_ID)
    .maybeSingle();
  if (error) throw new Error(`loading site_stats connection failed: ${error.message}`);
  const meta = (data?.meta ?? {}) as Meta;
  if (!data?.access_token_enc || !meta.stats_url) return null;
  return { id: data.id as string, statsUrl: meta.stats_url, key: decryptSecret(fromBytea(data.access_token_enc)), meta };
}

/** One call to the website's feed. Throws with a plain reason on any failure. */
export async function fetchSiteStats(
  feed: { statsUrl: string; key: string },
  from: string,
  to: string,
  f: typeof fetch = fetch,
): Promise<SiteStatsDay[]> {
  const url = `${feed.statsUrl}?from=${from}&to=${to}`;
  const res = await f(url, {
    headers: { authorization: `Bearer ${feed.key}` },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (res.status === 401) throw new Error("The website refused the stats key");
  if (!res.ok) throw new Error(`The website's stats feed answered ${res.status}`);
  return parseStatsDays(await res.json().catch(() => null));
}

/** The org's site.* metric ids, creating any missing definitions (never overwriting edits to existing ones). */
async function ensureDefinitions(orgId: string): Promise<Record<string, string>> {
  const admin = getSupabaseAdmin();
  const { error: upErr } = await admin
    .from("metric_definitions")
    .upsert(siteMetricDefinitions(orgId), { onConflict: "org_id,metric_key", ignoreDuplicates: true });
  if (upErr) throw new Error(`site metric definitions: ${upErr.message}`);
  const { data, error } = await admin
    .from("metric_definitions")
    .select("id, metric_key")
    .eq("org_id", orgId)
    .in("metric_key", SITE_METRICS.map((m) => m.metric_key));
  if (error) throw new Error(`site metric definitions: ${error.message}`);
  return Object.fromEntries((data ?? []).map((r) => [r.metric_key as string, r.id as string]));
}

async function latestCaptured(metricIds: string[]): Promise<string | null> {
  if (metricIds.length === 0) return null;
  const { data, error } = await getSupabaseAdmin()
    .from("metric_snapshots")
    .select("captured_on")
    .in("metric_id", metricIds)
    .order("captured_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`latest site snapshot: ${error.message}`);
  return (data?.captured_on as string | undefined) ?? null;
}

export type SyncResult =
  | { ok: true; orgId: string; days: number; written: number; from: string | null; to: string | null }
  | { ok: false; orgId: string; error: string };

/** Pulls the website's numbers since the last sync (or its whole history on the first run) into metric_snapshots. */
export async function syncSiteSignals(orgId: string, opts: { f?: typeof fetch; now?: Date } = {}): Promise<SyncResult> {
  let loaded: Feed | null;
  try {
    loaded = await loadFeed(orgId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[site-signals] ${orgId}:`, message);
    return { ok: false, orgId, error: message };
  }
  const feed = loaded;
  if (!feed) return { ok: false, orgId, error: "No website stats feed saved" };
  const admin = getSupabaseAdmin();
  const record = async (patch: Partial<Meta>, status: "active" | "error") => {
    await admin
      .from("connections")
      .update({ status, meta: { ...feed.meta, ...patch }, updated_at: new Date().toISOString() })
      .eq("id", feed.id);
  };

  try {
    const metricIds = await ensureDefinitions(orgId);
    const window = syncWindow(await latestCaptured(Object.values(metricIds)), pacificYesterday(opts.now));
    if (!window) {
      await record({ last_synced_at: new Date().toISOString(), last_error: null }, "active");
      return { ok: true, orgId, days: 0, written: 0, from: null, to: null };
    }

    let days: SiteStatsDay[] = [];
    for (const c of chunkWindow(window.from, window.to)) days.push(...(await fetchSiteStats(feed, c.from, c.to, opts.f)));
    if (window.backfill) days = trimLeadingEmpty(days);

    const rows = toSnapshots(orgId, metricIds, days);
    for (let i = 0; i < rows.length; i += 1000) {
      const { error } = await admin.from("metric_snapshots").upsert(rows.slice(i, i + 1000), { onConflict: "metric_id,captured_on" });
      if (error) throw new Error(`saving website numbers: ${error.message}`);
    }
    const lastDay = days.length ? days[days.length - 1].day : feed.meta.last_day;
    await record({ last_synced_at: new Date().toISOString(), last_day: lastDay, last_error: null }, "active");
    return { ok: true, orgId, days: days.length, written: rows.length, from: days[0]?.day ?? null, to: lastDay ?? null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[site-signals] ${orgId}:`, message);
    await record({ last_error: message }, "error").catch(() => undefined);
    return { ok: false, orgId, error: message };
  }
}

/** The daily cron: every org that holds aa.site_signals and has a saved feed. */
export async function syncAllSiteSignals(opts: { f?: typeof fetch; now?: Date } = {}): Promise<SyncResult[]> {
  const admin = getSupabaseAdmin();
  const [{ data: ents, error: entErr }, { data: feeds, error: feedErr }] = await Promise.all([
    admin.from("org_entitlements").select("org_id").eq("feature_key", "aa.site_signals").eq("enabled", true),
    admin.from("connections").select("org_id").eq("provider", SITE_STATS_PROVIDER).eq("external_id", EXTERNAL_ID),
  ]);
  if (entErr || feedErr) throw new Error(`site-signals orgs: ${(entErr ?? feedErr)!.message}`);
  const withFeed = new Set((feeds ?? []).map((r) => r.org_id as string));
  const orgs = Array.from(new Set((ents ?? []).map((r) => r.org_id as string))).filter((id) => withFeed.has(id));
  const out: SyncResult[] = [];
  for (const orgId of orgs) out.push(await syncSiteSignals(orgId, opts));
  return out;
}
