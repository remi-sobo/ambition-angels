/**
 * Single source of truth for "how old is the spine?".
 *
 * The HubSpot mirror is refreshed by a manual, chunked sync (one chunk per
 * POST to /api/admin/hubspot/sync, client-polled). Nothing schedules it, so
 * the data can drift. Phase 2 makes that drift honest: this module is the one
 * place that answers "when did we last have trustworthy data, and how stale is
 * it now?", and it's what the Phase 4 briefing engine reads to demote or flag
 * anything computed off a stale spine.
 *
 * Trust is measured from the last *full successful* sync (status "completed",
 * i.e. all four steps traversed with no hard-errored step) — not the last run,
 * because a "partial" or "failed" run did not fully refresh the spine. A run
 * that only skipped a few malformed engagement records (soft per-record
 * failures) still finishes "completed", so those benign skips don't stall the
 * trust clock.
 *
 * The pure helpers (ageLabel / ageDays / severity) take an explicit `now` so
 * they're deterministic and unit-testable; `getDataAge()` is the thin DB read.
 */

import { DATA_AGE } from "./thresholds";

export type DataAgeSeverity = "fresh" | "watch" | "stale";
export type LastRunStatus = "completed" | "partial" | "failed" | "running";

export type DataAge = {
  /** ISO of the last full successful sync — the trust clock. null = never. */
  lastFullSyncAt: string | null;
  /** ISO the most recent run finished (any status). null = none finished. */
  lastRunAt: string | null;
  /** Status of the most recent run. */
  lastRunStatus: LastRunStatus | null;
  /** Whole days since `lastFullSyncAt`. null when never fully synced. */
  ageDays: number | null;
  /** Compact human label since `lastFullSyncAt`: "just now" | "5m" | "3h" | "21d" | "never". */
  ageLabel: string;
  /** Severity of the spine's age, from DATA_AGE thresholds. */
  severity: DataAgeSeverity;
  /** When this snapshot was computed. */
  computedAt: string;
};

const DAY_MS = 86_400_000;

export function ageDays(iso: string | null, now: number = Date.now()): number | null {
  if (!iso) return null;
  return Math.floor((now - new Date(iso).getTime()) / DAY_MS);
}

export function ageLabel(iso: string | null, now: number = Date.now()): string {
  if (!iso) return "never";
  const mins = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export function severity(iso: string | null, now: number = Date.now()): DataAgeSeverity {
  if (!iso) return "stale";
  const days = (now - new Date(iso).getTime()) / DAY_MS;
  if (days >= DATA_AGE.staleAfterDays) return "stale";
  if (days >= DATA_AGE.watchAfterDays) return "watch";
  return "fresh";
}

/** True when the spine is too old to compute trustworthy briefing numbers from. */
export function isStale(age: Pick<DataAge, "severity">): boolean {
  return age.severity === "stale";
}

export async function getDataAge(): Promise<DataAge> {
  // Imported lazily so the pure helpers above stay unit-testable without
  // pulling the Supabase admin client (and its env) into the module graph.
  const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
  const sb = getSupabaseAdmin();

  // Most recent run of any status — for "last run" + its status nuance.
  const { data: latest } = await sb
    .from("hs_sync_jobs")
    .select("finished_at,status")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Most recent *full successful* sync — the trust clock.
  const { data: full } = await sb
    .from("hs_sync_jobs")
    .select("finished_at")
    .eq("status", "completed")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastFullSyncAt = full?.finished_at ?? null;
  const lastRunAt = latest?.finished_at ?? null;
  const lastRunStatus = (latest?.status as LastRunStatus | undefined) ?? null;

  return {
    lastFullSyncAt,
    lastRunAt,
    lastRunStatus,
    ageDays: ageDays(lastFullSyncAt),
    ageLabel: ageLabel(lastFullSyncAt),
    severity: severity(lastFullSyncAt),
    computedAt: new Date().toISOString(),
  };
}
