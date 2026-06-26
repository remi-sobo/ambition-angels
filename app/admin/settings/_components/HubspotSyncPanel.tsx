"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * HubSpot data sync — moved out of the sidebar into Settings so it stops
 * eating sidebar real estate. Same engine as before: a manual, chunked sync
 * (POST advances + returns state; we poll while running) plus the honest
 * "how old is the spine" data-age read. Light-themed for the Settings page.
 */

type SyncStatus = "running" | "completed" | "failed" | "partial";
type SyncResponse = {
  jobId: string;
  status: SyncStatus;
  finished_at: string | null;
  counts: { contacts: number; companies: number; deals: number; engagements: number };
  errors: Array<{ step: string; message: string }>;
};

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
  const running = job?.status === "running";
  const partial = job?.status === "partial";
  const finished = job?.status === "completed" || partial;

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
                  : "Run a sync to populate the spine"}
              </div>
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
          {counts.contacts} contacts · {counts.companies} companies · {counts.deals} deals · {counts.engagements} engagements
        </div>
      )}

      {syncError && <p className="text-xs text-expense">{syncError}</p>}

      {partial && job && job.errors.length > 0 && (
        <details className="text-xs text-ink-2">
          <summary className="cursor-pointer text-status-watch-text">Last run was partial — {job.errors.length} step(s) failed</summary>
          <ul className="mt-1.5 space-y-1 pl-4 list-disc text-ink-3">
            {job.errors.map((e, i) => (
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
