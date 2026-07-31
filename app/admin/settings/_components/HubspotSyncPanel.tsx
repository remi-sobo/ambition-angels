"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * HubSpot data sync — moved out of the sidebar into Settings so it stops
 * eating sidebar real estate. Same engine as before: a manual, chunked sync
 * (POST advances + returns state; we poll while running) plus the honest
 * "how old is the spine" data-age read. Light-themed for the Settings page.
 */

type SyncStatus = "running" | "completed" | "failed" | "partial";
type StepCounts = { contacts: number; companies: number; deals: number; engagements: number };
type SyncResponse = {
  jobId: string;
  status: SyncStatus;
  finished_at: string | null;
  counts: StepCounts;
  // Records available in HubSpot as of job start, per step — the denominator
  // for "X of Y synced". Null when that lookup itself failed; counts alone
  // still render fine without it.
  totals: StepCounts | null;
  errors: Array<{ step: string; message: string; kind?: string }>;
};

const STEP_LABELS: Array<{ key: keyof StepCounts; label: string }> = [
  { key: "contacts", label: "contacts" },
  { key: "companies", label: "companies" },
  { key: "deals", label: "deals" },
  { key: "engagements", label: "engagements" },
];

type DataAge = {
  lastFullSyncAt: string | null;
  ageLabel: string;
  ageDays: number | null;
  severity: "fresh" | "watch" | "stale";
  lastRunStatus: "completed" | "partial" | "failed" | "running" | null;
};

const ZERO = { contacts: 0, companies: 0, deals: 0, engagements: 0 };

// Severity → the warm status scale tuned for the cream Settings surface.
const AGE_DOT: Record<DataAge["severity"], string> = {
  fresh: "bg-status-healthy",
  watch: "bg-status-watch",
  stale: "bg-status-critical",
};
const AGE_TEXT: Record<DataAge["severity"], string> = {
  fresh: "text-status-healthy",
  watch: "text-status-watch-text",
  stale: "text-status-critical-text",
};

const fmtAgo = (iso: string): string => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};
const fmtDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function HubspotSyncPanel() {
  const [job, setJob] = useState<SyncResponse | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [dataAge, setDataAge] = useState<DataAge | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate "last synced" on mount so it survives reloads.
  useEffect(() => {
    fetch("/api/admin/hubspot/sync")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.jobId && setJob(j as SyncResponse))
      .catch(() => {});
  }, []);

  // Data age — re-fetched when a sync finishes so freshness updates in place.
  useEffect(() => {
    fetch("/api/admin/data-age")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setDataAge(d as DataAge))
      .catch(() => {});
  }, [job?.finished_at]);

  // Poll every 2s while running; each call advances the job one chunk.
  useEffect(() => {
    if (!job || job.status !== "running") return;
    pollRef.current = setTimeout(async () => {
      try {
        const r = await fetch("/api/admin/hubspot/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: job.jobId }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setJob(await r.json());
      } catch (e) {
        setSyncError(e instanceof Error ? e.message : "Sync failed");
        setJob((p) => (p ? { ...p, status: "failed" } : p));
      }
    }, 2000);
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [job]);

  const startSync = useCallback(async () => {
    setSyncError(null);
    try {
      const r = await fetch("/api/admin/hubspot/sync", { method: "POST" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setJob(await r.json());
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Sync failed");
    }
  }, []);

  const counts = job?.counts ?? ZERO;
  const totals = job?.totals ?? null;
  const running = job?.status === "running";
  const partial = job?.status === "partial";
  const finished = job?.status === "completed" || partial;
  const scopeErrors = job?.errors.filter((e) => e.kind === "missing_scope") ?? [];
  const otherErrors = job?.errors.filter((e) => e.kind !== "missing_scope") ?? [];

  // The specific reason the most recent run didn't fully complete, straight
  // from the job's own error log — shown inline instead of leaving the user
  // to expand the details drawer just to find out why. Missing-scope errors
  // already get their own dedicated callout below, so prefer a non-scope
  // reason here and only fall back to the scope error to avoid repeating it.
  const primaryError = otherErrors[0] ?? scopeErrors[0] ?? null;
  const lastRunReason =
    job && (job.status === "partial" || job.status === "failed") && primaryError
      ? `${primaryError.step}: ${primaryError.message}`
      : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {dataAge ? (
            <>
              <div className={`text-sm font-medium ${AGE_TEXT[dataAge.severity]}`}>
                <span className="inline-flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${AGE_DOT[dataAge.severity]}`} aria-hidden />
                  {dataAge.lastFullSyncAt ? `Data ${dataAge.ageLabel} old` : "Never fully synced"}
                  {dataAge.lastRunStatus === "partial" && " · last run partial"}
                </span>
              </div>
              <div className="text-xs text-ink-2 mt-0.5 pl-3.5">
                {dataAge.lastFullSyncAt
                  ? `Last full sync ${fmtDate(dataAge.lastFullSyncAt)}`
                  : lastRunReason
                    ? `Last attempt didn't finish — ${lastRunReason}`
                    : "Run a sync to populate the spine"}
              </div>
              {dataAge.lastFullSyncAt && dataAge.lastRunStatus === "partial" && lastRunReason && (
                <div className="text-xs text-status-watch-text mt-0.5 pl-3.5">
                  Since then, the last attempt stopped early — {lastRunReason}
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-ink-2">
              {running
                ? "Syncing…"
                : finished && job?.finished_at
                  ? `${partial ? "Synced (partial)" : "Synced"} ${fmtAgo(job.finished_at)}`
                  : "Not synced yet"}
            </div>
          )}
        </div>

        <button
          onClick={startSync}
          disabled={running}
          className="shrink-0 text-sm font-semibold text-white bg-orange hover:bg-orange-dark disabled:opacity-50 disabled:cursor-default px-4 py-2 rounded-lg transition-colors"
        >
          {running ? "Syncing…" : "Sync now"}
        </button>
      </div>

      {(running || finished) && (
        <div className="text-[11px] text-ink-3 [font-variant-numeric:tabular-nums]">
          {STEP_LABELS.map(
            ({ key, label }) => `${counts[key]}${totals ? ` of ${totals[key]}` : ""} ${label}`
          ).join(" · ")}
        </div>
      )}

      {running && (
        <p className="text-[11px] text-ink-3">
          Safe to navigate away — the sync keeps running and picks up right where it left off.
        </p>
      )}

      {syncError && <p className="text-xs text-expense">{syncError}</p>}

      {/* Missing-scope errors get a visible, actionable callout: the fix is a
          human granting the scope to the HubSpot private app, so don't bury
          the instructions inside the collapsed details below. */}
      {finished && scopeErrors.length > 0 && (
        <div className="rounded-lg bg-status-watch-bg border border-status-watch/40 px-3 py-2.5 space-y-1.5">
          <div className="text-xs font-semibold text-status-watch-text">
            HubSpot needs additional permissions
          </div>
          {scopeErrors.map((e, i) => (
            <p key={i} className="text-xs text-ink-2">{e.message}</p>
          ))}
          <p className="text-xs text-ink-3">
            Scope reference:{" "}
            <a
              href="https://developers.hubspot.com/scopes"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-ink-2"
            >
              developers.hubspot.com/scopes
            </a>
          </p>
        </div>
      )}

      {partial && job && otherErrors.length > 0 && (
        <details className="text-xs text-ink-2">
          <summary className="cursor-pointer text-status-watch-text">Last run was partial — {otherErrors.length} step(s) failed</summary>
          <ul className="mt-1.5 space-y-1 pl-4 list-disc text-ink-3">
            {otherErrors.map((e, i) => (
              <li key={i}>
                <span className="font-medium text-ink-2">{e.step}:</span> {e.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
