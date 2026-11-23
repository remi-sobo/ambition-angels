"use client";

// Manual trigger for the Gmail → interactions sync (Phase 1C.b). Mirrors the
// HubSpot sync in the sidebar: POST advances one chunk and returns job state;
// poll every 2s while running. The first run backfills all history; later runs
// (and the hourly cron) are incremental. The mailbox is read through the
// separate Internal OAuth client; a failed run usually means it needs
// reconnecting — surfaced as a hint.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { userMessage } from "@/lib/admin/errors";
import { GMAIL_SYNC_PAUSED } from "@/lib/fundraising/gmail-sync-flag";
import type { GmailSyncConnectionStatus } from "@/lib/google/gmail-sync-connection";

const CONNECT_HREF = "/api/admin/fundraising/gmail-sync/connect/start";

type Props = { connection: GmailSyncConnectionStatus; notice?: string | null };

// The mailbox line under the button: whether the internal Gmail app has a
// mailbox, with a connect link when it doesn't.
function MailboxLine({ connection, notice }: Props) {
  if (notice) return <span className="text-xs text-ink-3 max-w-[230px] text-right leading-tight">{notice}</span>;
  if (connection.state === "unconfigured") return null;
  if (connection.state === "active") {
    return (
      <span className="text-xs text-ink-3 max-w-[230px] text-right leading-tight">
        Mailbox: {connection.accountEmail}
      </span>
    );
  }
  return (
    <a href={CONNECT_HREF} className="text-xs font-semibold text-ink-2 hover:text-ink-1 underline">
      {connection.state === "error" ? "Reconnect mailbox" : "Connect mailbox"}
    </a>
  );
}

type Status = "running" | "completed" | "failed" | "partial";
type Job = {
  id: string;
  status: Status;
  mode: "backfill" | "incremental";
  counts: { scanned: number; logged: number; skipped: number };
  finished_at: string | null;
  errors?: { message: string }[];
};

function fmtAgo(iso: string | null): string {
  if (!iso) return "";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function looksLikeScopeError(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes("scope") || m.includes("insufficient") || m.includes("permission") || m.includes("403");
}

// While the sync is paused (lib/fundraising/gmail-sync-flag.ts) the button is a
// disabled label: no fetches, nothing to click.
export default function GmailSyncButton(props: Props) {
  if (GMAIL_SYNC_PAUSED) return <GmailSyncPaused {...props} />;
  // Not paused but no mailbox on the internal app: nothing to sync yet.
  if (props.connection.state !== "active") {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <span className="text-xs font-semibold px-4 py-2 rounded-full border-hairline bg-tile text-ink-3">
          Email sync not connected
        </span>
        <MailboxLine {...props} />
      </div>
    );
  }
  return <GmailSyncActive />;
}

function GmailSyncPaused(props: Props) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        disabled
        className="text-xs font-semibold px-4 py-2 rounded-full border-hairline bg-tile text-ink-3 opacity-60 cursor-not-allowed"
      >
        Email sync paused
      </button>
      <span className="text-xs text-ink-3 max-w-[230px] text-right leading-tight">
        BloomOS isn&apos;t reading the mailbox right now. Log emails by hand for now.
      </span>
      <MailboxLine {...props} />
    </div>
  );
}

function GmailSyncActive() {
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate the last job on mount so "Email synced …" survives reloads.
  useEffect(() => {
    fetch("/api/admin/fundraising/gmail-sync")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.id && setJob(j as Job))
      .catch(() => {});
  }, []);

  // Advance one chunk every 2s while running; refresh the page when it lands.
  useEffect(() => {
    if (!job || job.status !== "running") return;
    pollRef.current = setTimeout(async () => {
      try {
        const r = await fetch("/api/admin/fundraising/gmail-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: job.id }),
        });
        if (!r.ok) throw new Error(userMessage(r));
        const next = (await r.json()) as Job;
        setJob(next);
        if (next.status !== "running") router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Sync failed");
        setJob((p) => (p ? { ...p, status: "failed" } : p));
      }
    }, 2000);
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [job, router]);

  const start = useCallback(async () => {
    setError(null);
    // First-ever run backfills all history; after a completed run, incremental.
    const mode = job && job.status !== "running" ? "incremental" : "backfill";
    try {
      const r = await fetch("/api/admin/fundraising/gmail-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!r.ok) throw new Error(userMessage(r));
      setJob(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    }
  }, [job]);

  const running = job?.status === "running";
  const failed = job?.status === "failed" || !!error;
  const firstErr = job?.errors?.[0]?.message ?? error ?? "";

  const label = running
    ? `Syncing… ${job?.counts?.logged ?? 0} logged`
    : failed
    ? "Email sync failed. Retry"
    : job?.finished_at
    ? `Email synced ${fmtAgo(job.finished_at)}`
    : "Sync email";

  let hint: string | null = null;
  if (failed) {
    hint = looksLikeScopeError(firstErr)
      ? "Reconnect the mailbox through the internal Gmail app, then retry."
      : firstErr || "Try again.";
  } else if (job && !running && job.counts && job.counts.logged === 0 && job.counts.scanned > 0) {
    hint = "Scanned mail but matched no constituents on file.";
  } else if (running && job?.mode === "backfill") {
    hint = `Backfilling… ${job?.counts?.scanned ?? 0} scanned`;
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={start}
        disabled={running}
        className={`text-xs font-semibold px-4 py-2 rounded-full transition-colors disabled:opacity-60 ${
          failed
            ? "text-expense border-expense/30 bg-expense-bg hover:bg-expense-bg"
            : "text-ink-2 hover:text-ink-1 border-hairline bg-tile hover:bg-tile"
        }`}
      >
        {label}
      </button>
      {hint && (
        <span className="text-xs text-ink-3 max-w-[230px] text-right leading-tight">{hint}</span>
      )}
    </div>
  );
}
